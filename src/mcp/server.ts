/**
 * Remote MCP server: the claim graph for MCP clients (#73).
 *
 * One McpServer instance is built per HTTP request (stateless streamable-HTTP
 * transport — see routes/mcp.ts) and closed when the response finishes. The
 * caller's resolved identity (RequestAuth, from the shared auth plugin) is
 * baked into the instance, so every tool call is attributed to a user.
 *
 * Tool tiers mirror the REST API's metering split (#70):
 *   - Free reads: search_claims, get_claim, get_decomposition — no LLM work.
 *   - Agentic (metered + quota-gated): match_claim, extract_claims,
 *     assess_text — these run the Matcher/Extractor, so each call passes the
 *     same rate-limit + monthly-grant gate as the REST agentic endpoints, and
 *     runs inside a usage context so the per-token meter attributes the spend.
 *   - Writes: submit_contribution — routes through the existing contribution
 *     pipeline (Contribution Reviewer + reputation rules, #71).
 */
import { z } from "zod";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "../config.js";
import type { RequestAuth } from "../server/plugins/auth.js";
import { checkAgenticQuota } from "../server/plugins/quota.js";
import { runWithUsageContext } from "../llm/usage-context.js";
import { hybridSearch } from "../services/search-service.js";
import {
  getClaimById,
  getClaimInstances,
  listClaims,
} from "../services/claim-service.js";
import { getCurrentAssessment } from "../services/assessment-service.js";
import {
  getClaimTree,
  getSubclaimCount,
  getClaimDependents,
} from "../services/tree-service.js";
import { getArgumentsForClaim } from "../services/argument-service.js";
import { matchClaim } from "../llm/agents/matcher.js";
import { extractClaims } from "../llm/agents/extractor.js";
import {
  createContribution,
  getContributionById,
  getReviewForContribution,
} from "../services/contribution-service.js";
import { getOrCreateContributor } from "../services/contributor-service.js";
import { enqueueContribution } from "../services/queue-service.js";
import { contributionTypeEnum } from "../schemas/common.js";

export interface McpRequestContext {
  auth: RequestAuth;
  requestId: string;
}

// ---- helpers ----------------------------------------------------------------

function claimPageUrl(claimId: string): string {
  return `${loadConfig().publicWebBaseUrl.replace(/\/$/, "")}/claims/${claimId}`;
}

function jsonResult(payload: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(code: string, message: string, extra?: object): CallToolResult {
  return {
    isError: true,
    content: [
      { type: "text", text: JSON.stringify({ error: { code, message, ...extra } }) },
    ],
  };
}

function formatAssessment(
  a: {
    status: string;
    confidence: number;
    reasoningTrace: string;
    assessedAt: Date;
  } | null
) {
  if (!a) return null;
  return {
    status: a.status,
    confidence: a.confidence,
    reasoning_trace: a.reasoningTrace,
    assessed_at: a.assessedAt.toISOString(),
  };
}

/**
 * Gate + attribute an agentic (LLM-backed) tool call: enforce the shared
 * rate-limit/monthly-grant quota, then run the work inside a usage context so
 * the metering chokepoint (llm/client.ts) attributes every token to the
 * calling account and key.
 */
async function agentic<T>(
  ctx: McpRequestContext,
  fn: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; denied: CallToolResult }> {
  const decision = await checkAgenticQuota(ctx.auth);
  if (!decision.allowed) {
    return {
      ok: false,
      denied: errorResult(
        decision.code!,
        decision.message!,
        decision.entitlement ? { entitlement: decision.entitlement } : undefined
      ),
    };
  }
  const value = await runWithUsageContext(
    {
      userId: ctx.auth.userId,
      apiKeyId: ctx.auth.apiKeyId,
      requestId: ctx.requestId,
    },
    fn
  );
  return { ok: true, value };
}

/** Match one assertion against the graph and shape the shared result. */
async function matchAssertion(assertion: string, context?: string) {
  const decision = await matchClaim({
    extractedText: context ? `${assertion}\n\nContext: ${context}` : assertion,
    proposedCanonical: assertion,
  });

  if (!decision.is_match || !decision.matched_claim_id) {
    return {
      matched: false as const,
      proposed_canonical_form: decision.new_canonical_form ?? assertion,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
    };
  }

  const claim = await getClaimById(decision.matched_claim_id);
  const assessment = claim ? await getCurrentAssessment(claim.id) : null;
  return {
    matched: true as const,
    claim: claim
      ? {
          id: claim.id,
          canonical_form: claim.text,
          claim_type: claim.claimType,
          state: claim.state,
          importance: claim.importance,
          page_url: claimPageUrl(claim.id),
        }
      : { id: decision.matched_claim_id },
    // "affirms": the assertion states the canonical claim. "denies": it states
    // the negation, so the canonical assessment applies inverted.
    stance: decision.instance_stance,
    assessment: formatAssessment(assessment),
    confidence: decision.confidence,
    reasoning: decision.reasoning,
  };
}

// ---- server -----------------------------------------------------------------

export function buildMcpServer(ctx: McpRequestContext): McpServer {
  const server = new McpServer({
    name: "episteme",
    version: "0.1.0",
  });

  // ---- free read tools ----

  server.registerTool(
    "search_claims",
    {
      title: "Search claims",
      description:
        "Hybrid (semantic + keyword) search over Episteme's canonical claims. " +
        "Returns claims ranked by similarity, each with its current assessment " +
        "status/confidence and a link to its episteme.wiki page. Free (no LLM " +
        "work is metered).",
      inputSchema: {
        query: z.string().min(1).max(500).describe("Free-text search query"),
        limit: z.number().int().min(1).max(50).default(10),
        assessed: z
          .enum(["all", "assessed", "unassessed"])
          .default("all")
          .describe("Filter on whether a claim carries a current assessment"),
        min_importance: z.number().min(0).max(1).default(0),
      },
    },
    async ({ query, limit, assessed, min_importance }) => {
      const { results } = await hybridSearch(query, {
        limit,
        assessed,
        minImportance: min_importance,
      });
      return jsonResult({
        results: results.map((r) => ({
          id: r.id,
          canonical_form: r.text,
          claim_type: r.claim_type,
          state: r.state,
          similarity_score: r.similarity_score,
          importance: r.importance,
          assessment_status: r.assessment_status,
          assessment_confidence: r.assessment_confidence,
          page_url: claimPageUrl(r.id),
        })),
      });
    }
  );

  server.registerTool(
    "get_claim",
    {
      title: "Get claim",
      description:
        "Fetch a canonical claim: its canonical form, current assessment " +
        "(status, confidence, reasoning), provenance (source instances), " +
        "arguments, dependents, and episteme.wiki link. Free.",
      inputSchema: {
        claim_id: z.string().uuid(),
        include: z
          .array(z.enum(["provenance", "arguments", "dependents"]))
          .default(["provenance"])
          .describe("Optional detail sections to include"),
      },
    },
    async ({ claim_id, include }) => {
      const claim = await getClaimById(claim_id);
      if (!claim) return errorResult("NOT_FOUND", "Claim not found");

      const assessment = await getCurrentAssessment(claim_id);
      const payload: Record<string, unknown> = {
        claim: {
          id: claim.id,
          canonical_form: claim.text,
          claim_type: claim.claimType,
          state: claim.state,
          decomposition_status: claim.decompositionStatus,
          importance: claim.importance,
          created_at: claim.createdAt.toISOString(),
          updated_at: claim.updatedAt.toISOString(),
          page_url: claimPageUrl(claim.id),
        },
        assessment: formatAssessment(assessment),
        subclaim_count: await getSubclaimCount(claim_id),
      };
      if (include.includes("provenance")) {
        payload.instances = await getClaimInstances(claim_id);
      }
      if (include.includes("arguments")) {
        const args = await getArgumentsForClaim(claim_id);
        payload.arguments = args.map((a) => ({
          id: a.id,
          name: a.name,
          stance: a.stance,
          content: a.content,
          evidence_urls: a.evidenceUrls,
        }));
      }
      if (include.includes("dependents")) {
        payload.dependents = await getClaimDependents(claim_id);
      }
      return jsonResult(payload);
    }
  );

  server.registerTool(
    "get_decomposition",
    {
      title: "Get decomposition",
      description:
        "Fetch a claim's subclaim tree (recursive decomposition). Each node " +
        "carries its assessment status, so contested vs. settled structure is " +
        "visible: a disputed node under a well-supported parent marks exactly " +
        "where the disagreement lives. Free.",
      inputSchema: {
        claim_id: z.string().uuid(),
        max_depth: z.number().int().min(1).max(8).default(5),
      },
    },
    async ({ claim_id, max_depth }) => {
      const claim = await getClaimById(claim_id);
      if (!claim) return errorResult("NOT_FOUND", "Claim not found");
      const tree = await getClaimTree(claim_id, max_depth);
      return jsonResult({
        claim_id,
        page_url: claimPageUrl(claim_id),
        tree,
      });
    }
  );

  // ---- agentic (metered) tools ----

  server.registerTool(
    "match_claim",
    {
      title: "Match an assertion to a canonical claim",
      description:
        "Run a free-text assertion through Episteme's Matcher agent to decide " +
        "whether it is an existing canonical claim (possibly stated as its " +
        "negation) or new/unknown. On a match, returns the canonical claim, " +
        "the assertion's stance toward it (affirms/denies), and its current " +
        "assessment. Agentic: metered per token and quota-gated.",
      inputSchema: {
        assertion: z
          .string()
          .min(1)
          .max(2000)
          .describe("The assertion to check, as a single claim"),
        context: z
          .string()
          .max(2000)
          .optional()
          .describe("Optional surrounding text for disambiguation"),
      },
    },
    async ({ assertion, context }) => {
      const run = await agentic(ctx, () => matchAssertion(assertion, context));
      if (!run.ok) return run.denied;
      return jsonResult(run.value);
    }
  );

  server.registerTool(
    "extract_claims",
    {
      title: "Extract claims from text",
      description:
        "Run a passage through Episteme's Extractor agent to pull out its " +
        "discrete, checkable claims (each with a proposed canonical form, " +
        "claim type, and provisional importance). Agentic: metered per token " +
        "and quota-gated.",
      inputSchema: {
        text: z.string().min(1).max(100_000).describe("The text to extract from"),
        source_type: z
          .string()
          .max(100)
          .optional()
          .describe('Kind of text, e.g. "news_article", "documentation"'),
        max_claims: z.number().int().min(1).max(50).default(20),
      },
    },
    async ({ text, source_type, max_claims }) => {
      const run = await agentic(ctx, () =>
        extractClaims({
          content: text,
          sourceType: source_type,
          maxClaims: max_claims,
        })
      );
      if (!run.ok) return run.denied;
      return jsonResult({ claims: run.value });
    }
  );

  server.registerTool(
    "assess_text",
    {
      title: "Assess a passage against the claim graph",
      description:
        "Fact-check a passage: extract its claims, match each against the " +
        "graph, and return a per-claim judgment grounded in Episteme's " +
        "pre-computed assessments — the same judgment surface the browser " +
        "extension uses. Verdicts come from the graph, not from a model's " +
        "recollection. Agentic: metered per token and quota-gated.",
      inputSchema: {
        text: z.string().min(1).max(50_000).describe("The passage to assess"),
        max_claims: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(10)
          .describe("Cap on how many extracted claims to judge"),
      },
    },
    async ({ text, max_claims }) => {
      const run = await agentic(ctx, async () => {
        const extracted = await extractClaims({
          content: text,
          sourceType: "assess_text",
          maxClaims: max_claims,
        });
        const judgments = [];
        // Sequential on purpose: each match is its own tool-use loop, and a
        // passage's claims often overlap — bursting them in parallel just
        // races the same vector searches while multiplying peak LLM load.
        for (const c of extracted) {
          const match = await matchAssertion(
            c.original_text,
            c.context ?? undefined
          );
          judgments.push({
            original_text: c.original_text,
            proposed_canonical_form: c.proposed_canonical_form,
            claim_type: c.claim_type,
            // "unknown": the graph has no canonical claim for this assertion.
            // "unassessed": it exists but has no current assessment yet.
            verdict: !match.matched
              ? "unknown"
              : (match.assessment?.status ?? "unassessed"),
            ...match,
          });
        }
        return judgments;
      });
      if (!run.ok) return run.denied;
      return jsonResult({ judgments: run.value });
    }
  );

  // ---- writes ----

  server.registerTool(
    "submit_contribution",
    {
      title: "Submit a contribution",
      description:
        "File a challenge, supporting evidence, merge/split/edit proposal, or " +
        "argument against a canonical claim. The contribution enters the " +
        "standard review pipeline (Contribution Reviewer agent, reputation " +
        "and good-faith policy) and is attributed to your account. Returns " +
        "the contribution id to check review status later.",
      inputSchema: {
        claim_id: z.string().uuid(),
        contribution_type: contributionTypeEnum,
        content: z.string().min(1).max(10_000),
        evidence_urls: z.array(z.string().url()).max(20).default([]),
        merge_target_claim_id: z.string().uuid().optional(),
        proposed_canonical_form: z.string().max(2000).optional(),
      },
    },
    async (input) => {
      // Contributing requires a real contributor identity (#71): a key bound
      // to an account, or a session acting user — never anonymous.
      const externalId = ctx.auth.contributorExternalId;
      if (!externalId) {
        return errorResult(
          "NO_CONTRIBUTOR_IDENTITY",
          "This API key is not bound to a contributor identity; contributions must be attributable"
        );
      }

      const claim = await getClaimById(input.claim_id);
      if (!claim) return errorResult("NOT_FOUND", "Claim not found");

      const contributor = await getOrCreateContributor({
        externalId,
        displayName: externalId,
      });
      if (contributor.isSuspended) {
        return errorResult(
          "CONTRIBUTOR_SUSPENDED",
          `Contributor is suspended: ${contributor.suspensionReason ?? "No reason provided"}`
        );
      }

      const contribution = await createContribution({
        claimId: input.claim_id,
        contributorId: contributor.id,
        contributionType: input.contribution_type,
        content: input.content,
        evidenceUrls: input.evidence_urls,
        mergeTargetClaimId: input.merge_target_claim_id,
        proposedCanonicalForm: input.proposed_canonical_form,
      });
      await enqueueContribution({ contributionId: contribution.id });

      return jsonResult({
        contribution: {
          id: contribution.id,
          claim_id: contribution.claimId,
          contribution_type: contribution.contributionType,
          review_status: contribution.reviewStatus,
          submitted_at: contribution.submittedAt.toISOString(),
        },
      });
    }
  );

  server.registerTool(
    "get_contribution_status",
    {
      title: "Get contribution review status",
      description:
        "Check the review outcome of a previously submitted contribution: " +
        "decision, reasoning, and policy citations once the Contribution " +
        "Reviewer has ruled. Free.",
      inputSchema: { contribution_id: z.string().uuid() },
    },
    async ({ contribution_id }) => {
      const contribution = await getContributionById(contribution_id);
      if (!contribution) {
        return errorResult("NOT_FOUND", "Contribution not found");
      }
      const review = await getReviewForContribution(contribution_id);
      return jsonResult({
        contribution: {
          id: contribution.id,
          claim_id: contribution.claimId,
          contribution_type: contribution.contributionType,
          review_status: contribution.reviewStatus,
          submitted_at: contribution.submittedAt.toISOString(),
        },
        review: review
          ? {
              decision: review.decision,
              reasoning: review.reasoning,
              confidence: review.confidence,
              policy_citations: review.policyCitations,
              reviewed_at: review.reviewedAt.toISOString(),
            }
          : null,
      });
    }
  );

  // ---- resources ----

  server.registerResource(
    "claim",
    new ResourceTemplate("claim://{claim_id}", { list: undefined }),
    {
      title: "Canonical claim",
      description:
        "A canonical claim with its current assessment and decomposition tree, " +
        "attachable as context.",
      mimeType: "application/json",
    },
    async (uri, { claim_id }) => {
      const id = String(claim_id);
      const claim = await getClaimById(id);
      if (!claim) throw new Error(`Claim not found: ${id}`);
      const [assessment, tree] = [
        await getCurrentAssessment(id),
        await getClaimTree(id),
      ];
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                claim: {
                  id: claim.id,
                  canonical_form: claim.text,
                  claim_type: claim.claimType,
                  state: claim.state,
                  importance: claim.importance,
                  page_url: claimPageUrl(claim.id),
                },
                assessment: formatAssessment(assessment),
                tree,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerResource(
    "recent-claims",
    "claims://recent",
    {
      title: "Recently updated claims",
      description:
        "The most recently updated canonical claims, highest-importance view " +
        "of what the graph is working on.",
      mimeType: "application/json",
    },
    async (uri) => {
      const { results } = await listClaims({ limit: 30, assessed: "all" });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                results: results.map((r) => ({
                  ...r,
                  page_url: claimPageUrl(r.id),
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ---- prompts ----

  server.registerPrompt(
    "fact_check_document",
    {
      title: "Fact-check a document against Episteme",
      description:
        "Assess every checkable claim in a document against the Episteme " +
        "claim graph and produce a grounded report.",
      argsSchema: {
        document: z.string().describe("The document text to fact-check"),
      },
    },
    ({ document }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Fact-check the following document against the Episteme claim graph.\n\n" +
              "Use the `assess_text` tool on the document (chunk it if it is long). " +
              "For each judged claim, report the verdict that came back from the " +
              "graph — do not substitute your own recollection. Where the verdict " +
              "is `unknown`, say the graph has no canonical claim for it yet; where " +
              "it is `unassessed`, say the claim exists but has not been assessed. " +
              "Mind the `stance` field: a `denies` stance means the document asserts " +
              "the NEGATION of the canonical claim, so invert the assessment when " +
              "judging the document's sentence. Cite each claim's `page_url`.\n\n" +
              "Document:\n\n" +
              document,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "check_assertion",
    {
      title: "Check a single assertion",
      description:
        "Check one assertion against the graph and explain its standing.",
      argsSchema: {
        assertion: z.string().describe("The assertion to check"),
      },
    },
    ({ assertion }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Check this assertion against the Episteme claim graph using the " +
              "`match_claim` tool, then explain its standing: the canonical claim " +
              "it maps to (if any), the current assessment and confidence, and — " +
              "if you need the contested/settled structure — `get_decomposition`. " +
              "Report the graph's judgment, not your own recollection, and link " +
              "the claim's `page_url`.\n\n" +
              `Assertion: ${assertion}`,
          },
        },
      ],
    })
  );

  return server;
}
