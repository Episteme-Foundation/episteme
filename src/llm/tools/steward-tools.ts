/**
 * Action tools for the Claim Steward agent.
 *
 * These let the steward update assessments, modify canonical forms,
 * add decomposition edges, log decisions, and notify dependent stewards.
 */
import type Anthropic from "@anthropic-ai/sdk";
type Tool = Anthropic.Tool;
import { eq, and } from "drizzle-orm";
import { getDb, rawQuery } from "../../db/client.js";
import {
  claims,
  assessments,
  claimRelationships,
  auditLog,
} from "../../db/schema.js";
import { generateEmbedding } from "../../services/embedding-service.js";
import {
  addArgument,
  getArgument,
  getArgumentSubclaims,
  parseClaimLinks,
  setArgumentContent,
} from "../../services/argument-service.js";
import { loadConfig } from "../../config.js";
import {
  enqueueSteward,
  enqueueClaimPipeline,
  enqueueCurator,
} from "../../services/queue-service.js";

/** Coerce a tool input to a clamped importance in [0, 1], or undefined if absent/invalid. */
function clampImportance(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(1, Math.max(0, n));
}

export function getStewardToolDefinitions(): Tool[] {
  return [
    {
      name: "update_claim_assessment",
      description:
        "Update the assessment of a claim. Marks the previous assessment " +
        "as non-current and creates a new current assessment.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: {
            type: "string",
            description: "The UUID of the claim to assess",
          },
          status: {
            type: "string",
            enum: [
              "verified",
              "supported",
              "contested",
              "unsupported",
              "contradicted",
              "unknown",
            ],
            description: "New assessment status",
          },
          confidence: {
            type: "number",
            description:
              "Verdict confidence (0.0-1.0): how sure you are that the status " +
              "you chose is the right reading of the evidence. Meta by design; " +
              "NOT the probability that the claim is true. A claim can be " +
              "confidently CONTESTED.",
          },
          claim_credence: {
            type: "number",
            description:
              "Optional credence (0.0-1.0): your probability that the claim, as " +
              "stated, is TRUE. Give it only where a single number is an honest " +
              "summary (typically concrete empirical questions). Omit it where " +
              "it would be false precision: normative or evaluative claims, " +
              "definitional choices, or composites whose parts pull in different " +
              "directions. Omitting is itself information, not a failure.",
          },
          assessment: {
            type: "string",
            description:
              "The reader-facing account of where the claim stands, shown first when " +
              "someone lands on its page. Self-contained prose in the third person, " +
              "like the opening of a good encyclopedia entry: what the claim rests " +
              "on, what the evidence shows, and for a contested claim where the " +
              "credible disagreement lies and what would resolve it. Let the length " +
              "follow the claim: a settled one may be two or three sentences, a " +
              "contested or foundational one a few short paragraphs. Keep " +
              "the machinery out of it: no tool or edge names (SUPPORTS/CONTRADICTS " +
              "edge), no importance numbers, no 'per the constitution', no first-" +
              "person 'I', and no narration of your own bookkeeping (merges, " +
              "canonical-form edits, importance changes go in " +
              "log_stewardship_decision).",
          },
          reasoning_trace: {
            type: "string",
            description:
              "The transparent audit detail behind the verdict, shown secondary to " +
              "the assessment (behind a disclosure). Lay out the specific evidence, " +
              "source instances, and how the material subclaims weigh. This is about " +
              "the CLAIM'S TRUTH — keep structural bookkeeping out of it. Refer to " +
              "subclaims by their text (quoted or paraphrased), never by bare UUID — " +
              "ids are opaque to the human readers this trace exists for.",
          },
        },
        required: ["claim_id", "status", "confidence", "assessment", "reasoning_trace"],
      },
    },
    {
      name: "update_canonical_form",
      description:
        "Update the canonical form (text) of a claim. Wording is judged fresh " +
        "on its merits (constitution §3): the shortest neutral statement of the " +
        "proposition as actually debated, about fifteen words. The node's " +
        "identity and history stay stable while its wording improves; never " +
        "keep a worse form because it came first. Do not change what the claim " +
        "IS: a rewording that different considerations would bear on is a " +
        "different claim, and rewording into the negation would flip every " +
        "recorded stance. Escalate those to the Curator instead.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: {
            type: "string",
            description: "The UUID of the claim to update",
          },
          new_text: {
            type: "string",
            description: "The new canonical form text",
          },
          reasoning: {
            type: "string",
            description: "Why this change improves the canonical form",
          },
        },
        required: ["claim_id", "new_text", "reasoning"],
      },
    },
    {
      name: "add_argument",
      description:
        "Create a named argument (a line of reasoning) on a claim — a grouping " +
        "that subclaims attach to. Use when distinct for/against lines of reasoning " +
        "exist; pass the returned argument_id to add_relationship_edge / " +
        "add_decomposition_edge to group subclaims under it. The description is a " +
        "label for the line of reasoning, not itself a proposition. An argument is " +
        "NOT finished at creation: once its subclaim edges are attached, you MUST " +
        "give it a written form with write_argument.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: {
            type: "string",
            description: "The UUID of the claim this argument is about",
          },
          name: {
            type: "string",
            description: "Short descriptive name for the line of reasoning",
          },
          stance: {
            type: "string",
            enum: ["for", "against", "neutral"],
            description: "Whether this argument supports, opposes, or is neutral",
          },
          description: {
            type: "string",
            description: "Brief label for this line of reasoning (not a proposition)",
          },
        },
        required: ["claim_id", "name", "stance", "description"],
      },
    },
    {
      name: "write_argument",
      description:
        "Write (or revise) an argument's written form: a brief, logically " +
        "straightforward prose statement of HOW its subclaims combine to bear on " +
        "the claim — the inferential step the grouping alone leaves implicit. " +
        "1–3 sentences, e.g. 'Because [[claim:<uuid>]] and [[claim:<uuid>]], and " +
        "given [[claim:<uuid>]], the claim follows.' Reference EVERY subclaim in " +
        "the argument inline as [[claim:<uuid>]] (or [[claim:<uuid>|inline " +
        "phrasing]] when grammar needs it) — links resolve to the claims' " +
        "canonical text at render time. The written form is structural, not " +
        "epistemic: state the inference, never a verdict on whether it holds. " +
        "Call this after attaching the argument's subclaim edges; call it again " +
        "whenever the argument's subclaims change.",
      input_schema: {
        type: "object" as const,
        properties: {
          argument_id: {
            type: "string",
            description: "The UUID of the argument (from add_argument)",
          },
          content: {
            type: "string",
            description:
              "The written form: brief prose with inline [[claim:<uuid>]] " +
              "references to the argument's subclaims",
          },
        },
        required: ["argument_id", "content"],
      },
    },
    {
      name: "add_relationship_edge",
      description:
        "Attach an EXISTING claim as a subclaim, by id. Use this when match_claim " +
        "found that the dependency you want already exists (as itself, a rewording, " +
        "or its negation) — link it instead of minting a duplicate. Edges to your " +
        "claim's decomposition are yours to own.",
      input_schema: {
        type: "object" as const,
        properties: {
          parent_id: {
            type: "string",
            description: "The UUID of the parent claim (the claim you steward)",
          },
          child_id: {
            type: "string",
            description: "The UUID of the existing claim to attach as a subclaim",
          },
          relation: {
            type: "string",
            enum: [
              "requires",
              "supports",
              "contradicts",
              "specifies",
              "defines",
              "presupposes",
            ],
            description: "Relationship type",
          },
          reasoning: {
            type: "string",
            description: "Why this dependency holds",
          },
          argument_id: {
            type: "string",
            description:
              "Optional UUID of an argument (from add_argument) to group this " +
              "subclaim under",
          },
        },
        required: ["parent_id", "child_id", "relation", "reasoning"],
      },
    },
    {
      name: "add_decomposition_edge",
      description:
        "Create a NEW subclaim and attach it to a claim's decomposition. Use only " +
        "after match_claim confirms the proposition does NOT already exist — " +
        "otherwise use add_relationship_edge to link the existing claim.",
      input_schema: {
        type: "object" as const,
        properties: {
          parent_id: {
            type: "string",
            description: "The UUID of the parent claim",
          },
          child_text: {
            type: "string",
            description: "Text of the subclaim to add",
          },
          relation: {
            type: "string",
            enum: [
              "requires",
              "supports",
              "contradicts",
              "specifies",
              "defines",
              "presupposes",
            ],
            description: "Relationship type",
          },
          reasoning: {
            type: "string",
            description: "Why this decomposition is valid",
          },
          argument_id: {
            type: "string",
            description:
              "Optional UUID of an argument (from add_argument) to group this " +
              "subclaim under",
          },
          importance: {
            type: "number",
            description:
              "How much it is worth spending scarce intelligence to get this " +
              "subclaim right, 0..1 — roughly consequence-if-wrong × contestability, " +
              "NOT logical necessity. A dependency can be maximally load-bearing " +
              "(the parent is false without it) yet LOW importance because nobody " +
              "disputes it — getting an uncontested fact right is free. Reserve " +
              "high values for contested, consequential dependencies. " +
              "This orders the work queue AND (below a threshold) leaves the " +
              "subclaim an un-decomposed embedded stub, so score uncontested " +
              "bedrock low. Defaults to 0.5 if omitted.",
          },
        },
        required: ["parent_id", "child_text", "relation", "reasoning"],
      },
    },
    {
      name: "set_claim_importance",
      description:
        "Set a claim's importance (0..1) — how much it is worth spending scarce " +
        "intelligence to get it right (roughly consequence-if-wrong × " +
        "contestability), NOT mere logical load-bearing-ness. A revisable judgment " +
        "that scales effort and orders the work queue. Local dependents are only a " +
        "local signal: a claim central to a niche subfield is still low-importance " +
        "if the subfield is peripheral and the claim uncontested. An uncontested " +
        "fact is low importance even if much depends on it, because getting it " +
        "right is free.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: { type: "string", description: "The UUID of the claim" },
          importance: {
            type: "number",
            description:
              "Importance score in [0, 1]. Anchor against constitution §19: " +
              "~0.9 central, ~0.6 major, ~0.35 notable, ~0.15 minor/settled.",
          },
          reasoning: {
            type: "string",
            description: "Why the claim has this importance",
          },
        },
        required: ["claim_id", "importance", "reasoning"],
      },
    },
    {
      name: "log_stewardship_decision",
      description:
        "Log a stewardship decision for the audit trail. Use this to record " +
        "significant decisions you make about a claim.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: {
            type: "string",
            description: "The UUID of the claim",
          },
          action_taken: {
            type: "string",
            description:
              "What action was taken (e.g. 'reassessed', 'updated_canonical_form', 'no_action_needed')",
          },
          reasoning: {
            type: "string",
            description: "Full reasoning for the decision",
          },
        },
        required: ["claim_id", "action_taken", "reasoning"],
      },
    },
    {
      name: "notify_dependent_stewards",
      description:
        "Notify stewards of claims that depend on this claim, so they can " +
        "evaluate whether the change is material to their claims.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: {
            type: "string",
            description: "The UUID of the claim whose assessment changed",
          },
          change_summary: {
            type: "string",
            description: "Brief summary of what changed",
          },
        },
        required: ["claim_id", "change_summary"],
      },
    },
    {
      name: "escalate_to_curator",
      description:
        "Flag a graph-level structural concern for the Curator — e.g. this claim " +
        "looks like a duplicate/counterpart of another, conflates two distinct " +
        "claims (should be split), or should be linked to a related claim. " +
        "Individuation (merge/split) and cross-claim edges are the Curator's domain, " +
        "not yours; raise it and let the Curator adjudicate.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: {
            type: "string",
            description: "The UUID of the claim with the structural concern",
          },
          concern: {
            type: "string",
            description:
              "What you noticed (e.g. 'likely duplicate of <id>', 'conflates X and Y')",
          },
        },
        required: ["claim_id", "concern"],
      },
    },
  ];
}

export async function executeStewardTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (toolName) {
      case "update_claim_assessment": {
        const claimId = input.claim_id as string;
        // The prompt discusses statuses in UPPERCASE (VERIFIED, CONTESTED, …)
        // but the enum — and every reader — is lowercase; normalize like the
        // relation-type writes do so a prose-following model can't persist an
        // out-of-enum value.
        const status = String(input.status).toLowerCase();
        const confidence = input.confidence as number;
        // Optional: only recorded where a probability of truth is meaningful
        // (constitution §7). null, not 0 — "no credence stated" is a distinct
        // signal from "credence that the claim is false".
        const claimCredence =
          typeof input.claim_credence === "number" ? input.claim_credence : null;
        const reasoningTrace = input.reasoning_trace as string;
        // Reader-facing assessment (still persisted to the `summary` column). Also
        // accept the legacy `summary` key so an in-flight tool call from the older
        // prompt still lands, and fall back to the reasoning trace when neither is
        // given, so the page never renders blank — the UI has the same fallback, but
        // keeping the column populated means a later render never has to.
        const summary =
          ((input.assessment ?? input.summary) as string | undefined)?.trim() || reasoningTrace;

        const db = getDb();

        // Carry over the current assessment's subclaim breakdown: a steward
        // reassessment of status/confidence shouldn't wipe it. Filter on
        // isCurrent so we read the active row (not an arbitrary historical one),
        // and fall back to {} so the column is never null (it is notNull).
        const [prev] = await db
          .select({ subclaimSummary: assessments.subclaimSummary })
          .from(assessments)
          .where(and(eq(assessments.claimId, claimId), eq(assessments.isCurrent, true)))
          .limit(1);

        // Mark previous assessment as non-current
        await db
          .update(assessments)
          .set({ isCurrent: false })
          .where(eq(assessments.claimId, claimId));

        // Insert new assessment
        await db.insert(assessments).values({
          claimId,
          status,
          confidence,
          claimCredence,
          summary,
          reasoningTrace,
          subclaimSummary: prev?.subclaimSummary ?? {},
          isCurrent: true,
          trigger: "steward_reassessment",
        });

        return JSON.stringify({
          success: true,
          message: `Assessment updated for claim ${claimId}: ${status} (${confidence})`,
        });
      }

      case "update_canonical_form": {
        const claimId = input.claim_id as string;
        const newText = input.new_text as string;

        const db = getDb();

        // Update claim text and regenerate embedding
        let embedding: number[] | undefined;
        try {
          embedding = await generateEmbedding(newText);
        } catch {
          // Continue without embedding update
        }

        await db
          .update(claims)
          .set({
            text: newText,
            ...(embedding ? { embedding } : {}),
            updatedAt: new Date(),
          })
          .where(eq(claims.id, claimId));

        return JSON.stringify({
          success: true,
          message: `Canonical form updated for claim ${claimId}`,
        });
      }

      case "set_claim_importance": {
        const claimId = input.claim_id as string;
        const importance = clampImportance(input.importance);
        if (importance === undefined) {
          return JSON.stringify({
            success: false,
            message: "importance must be a number in [0, 1].",
          });
        }

        const db = getDb();
        await db
          .update(claims)
          .set({ importance, updatedAt: new Date() })
          .where(eq(claims.id, claimId));

        return JSON.stringify({
          success: true,
          message: `Importance of claim ${claimId} set to ${importance}.`,
        });
      }

      case "add_argument": {
        const claimId = input.claim_id as string;
        const name = input.name as string;
        const stance = input.stance as "for" | "against" | "neutral";
        const description = input.description as string;

        const argument = await addArgument({
          claimId,
          stance,
          content: description,
          name,
          description,
          createdBy: "claim_steward",
        });

        return JSON.stringify({
          success: true,
          message:
            `Created argument "${name}" (${stance}) on claim ${claimId}. ` +
            `Attach its subclaim edges, then give it a written form with write_argument.`,
          argument_id: argument.id,
        });
      }

      case "write_argument": {
        const argumentId = input.argument_id as string;
        const content = ((input.content as string) ?? "").trim();

        const argument = await getArgument(argumentId);
        if (!argument) {
          return JSON.stringify({
            success: false,
            message: `Argument not found: ${argumentId}`,
          });
        }

        // Brief means brief: uuid links cost ~46 chars each, so the cap is
        // roomier than the 1–3 sentences it is meant to hold, but it still
        // stops essays.
        if (content.length > 1000) {
          return JSON.stringify({
            success: false,
            message:
              `Written form is ${content.length} chars; keep it under 1000. ` +
              `State the inference in 1–3 sentences — detail belongs in the ` +
              `subclaims themselves.`,
          });
        }

        const links = parseClaimLinks(content);
        if (links.length === 0) {
          return JSON.stringify({
            success: false,
            message:
              "The written form must reference the argument's subclaims inline " +
              "as [[claim:<uuid>]] — a written form with no links is just a " +
              "longer label.",
          });
        }

        // Mutual checkability: every link must be a subclaim edge of this
        // argument (or the parent claim itself), and every subclaim should be
        // referenced. Unknown links fail; unreferenced subclaims only warn, so
        // a steward mid-restructure is nudged, not wedged.
        const subclaims = await getArgumentSubclaims(argumentId);
        const subclaimIds = new Set(subclaims.map((s) => s.id));
        const linkedIds = new Set(links.map((l) => l.claimId));

        const unknown = [...linkedIds].filter(
          (id) => !subclaimIds.has(id) && id !== argument.claimId
        );
        if (unknown.length > 0) {
          return JSON.stringify({
            success: false,
            message:
              `These linked claims are not subclaims of this argument: ` +
              `${unknown.join(", ")}. Link only claims attached to the ` +
              `argument via add_relationship_edge / add_decomposition_edge ` +
              `(attach the edge first if it is missing).`,
          });
        }

        await setArgumentContent(argumentId, content);

        const unreferenced = subclaims.filter((s) => !linkedIds.has(s.id));
        return JSON.stringify({
          success: true,
          message:
            `Written form saved for argument "${argument.name ?? argumentId}".` +
            (unreferenced.length > 0
              ? ` Note: ${unreferenced.length} subclaim(s) in this argument are ` +
                `not referenced: ` +
                unreferenced
                  .map((s) => `${s.id} ("${s.text.slice(0, 60)}")`)
                  .join("; ") +
                `. Reference every subclaim, or detach edges that no longer ` +
                `belong to this line of reasoning.`
              : ""),
        });
      }

      case "add_relationship_edge": {
        const parentId = input.parent_id as string;
        const childId = input.child_id as string;
        const relation = input.relation as string;
        const reasoning = input.reasoning as string;
        const argumentId = (input.argument_id as string) ?? null;

        if (parentId === childId) {
          return JSON.stringify({
            success: false,
            message: "A claim cannot be its own subclaim (parent_id === child_id).",
          });
        }

        const db = getDb();

        // Link an already-existing claim; it has (or will have) its own steward
        // processing, so no enqueue here — just the edge.
        try {
          await db.insert(claimRelationships).values({
            parentClaimId: parentId,
            childClaimId: childId,
            relationType: relation.toLowerCase(),
            reasoning,
            confidence: 1.0,
            argumentId,
            createdBy: "claim_steward",
          });
        } catch {
          // Unique constraint -- this edge already exists; idempotent, ignore.
        }

        return JSON.stringify({
          success: true,
          message: `Linked existing claim ${childId} as a subclaim of ${parentId} (${relation}).`,
          child_claim_id: childId,
        });
      }

      case "add_decomposition_edge": {
        const parentId = input.parent_id as string;
        const childText = input.child_text as string;
        const relation = input.relation as string;
        const reasoning = input.reasoning as string;
        const argumentId = (input.argument_id as string) ?? null;
        const importance = clampImportance(input.importance);

        const db = getDb();

        // Create the subclaim
        let embedding: number[] | undefined;
        try {
          embedding = await generateEmbedding(childText);
        } catch {
          // Continue without embedding
        }

        // Economic brake (#98/#68): a subclaim the Steward judged below
        // stewardEnqueueMinImportance is left a *deferred* embedded stub — NOT
        // recursively decomposed. Uncontested bedrock (settled math/definitions)
        // now scores low importance, so this stops the "one physics claim spawns a
        // whole textbook" cost explosion at its root. Crucially the gate must set
        // steward_state='deferred', because a claim created with the default
        // 'pending' is ALREADY in the importance-ordered drain queue regardless of
        // whether we enqueue a pipeline for it — the enqueue path only sets the
        // trigger/decompositionStatus. 'deferred' keeps it out of the drain; a
        // later re-trigger (enqueueSteward, e.g. a dependent's notification) flips
        // it back to 'pending', so nothing is permanently stranded.
        const { stewardEnqueueMinImportance, pipelineEpoch } = loadConfig();
        const effectiveImportance = importance ?? 0.5;
        const gated =
          stewardEnqueueMinImportance > 0 &&
          effectiveImportance < stewardEnqueueMinImportance;

        const [newClaim] = await db
          .insert(claims)
          .values({
            text: childText,
            claimType: "empirical_derived",
            embedding: embedding ?? undefined,
            ...(importance !== undefined ? { importance } : {}),
            ...(gated ? { stewardState: "deferred" } : {}),
            pipelineEpoch,
            createdBy: "claim_steward",
          })
          .returning();

        // Create relationship
        try {
          await db.insert(claimRelationships).values({
            parentClaimId: parentId,
            childClaimId: newClaim!.id,
            relationType: relation.toLowerCase(),
            reasoning,
            confidence: 1.0,
            argumentId,
            createdBy: "claim_steward",
          });
        } catch {
          // Unique constraint -- relationship may already exist
        }

        // The new claim is created already embedded (above), so it is a valid,
        // dedup-able stub even if it is never processed. When NOT gated, we onboard
        // it so its own Steward structures + assesses it, like any other claim.
        // Steward work isn't tied to an ingestion job, so use a sentinel jobId (the
        // pipeline only threads jobId; it never looks it up). No ancestor/depth
        // threading: the child's Steward calls match_claim before creating
        // anything, so it links this parent (and any other ancestor) rather than
        // looping into it.
        if (!gated) {
          await enqueueClaimPipeline({
            claimId: newClaim!.id,
            jobId: "steward",
          });
        }

        return JSON.stringify({
          success: true,
          message:
            `Added subclaim to ${parentId}: "${childText}" (${relation})` +
            (gated
              ? ` — kept as a deferred embedded stub (importance ` +
                `${effectiveImportance} below the decomposition threshold ` +
                `${stewardEnqueueMinImportance}); not recursively decomposed.`
              : ""),
          child_claim_id: newClaim!.id,
        });
      }

      case "log_stewardship_decision": {
        const claimId = input.claim_id as string;
        const actionTaken = input.action_taken as string;
        const reasoning = input.reasoning as string;

        // The durable audit trail the constitution promises (#100) — an
        // append-only row per decision, not just a bumped timestamp.
        const db = getDb();
        await db.insert(auditLog).values({
          claimId,
          action: actionTaken,
          reasoning,
          createdBy: "claim_steward",
        });
        await db
          .update(claims)
          .set({ updatedAt: new Date() })
          .where(eq(claims.id, claimId));

        return JSON.stringify({
          success: true,
          message: `Stewardship decision logged for claim ${claimId}: ${actionTaken}`,
          action: actionTaken,
          reasoning,
        });
      }

      case "notify_dependent_stewards": {
        const claimId = input.claim_id as string;
        const changeSummary = input.change_summary as string;

        // Find parent claims and enqueue steward messages for each
        const parents = await rawQuery<{ parent_id: string }>(
          `SELECT DISTINCT parent_claim_id AS parent_id
           FROM claim_relationships
           WHERE child_claim_id = $1`,
          [claimId]
        );

        for (const parent of parents) {
          await enqueueSteward({
            claimId: parent.parent_id,
            trigger: "subclaim_change",
            context: `Subclaim ${claimId} changed: ${changeSummary}`,
          });
        }

        return JSON.stringify({
          success: true,
          message: `Notified ${parents.length} dependent claim stewards`,
          parent_claim_ids: parents.map((p) => p.parent_id),
        });
      }

      case "escalate_to_curator": {
        const claimId = input.claim_id as string;
        const concern = input.concern as string;

        await enqueueCurator({
          trigger: "steward_escalation",
          claimId,
          context: concern,
        });

        return JSON.stringify({
          success: true,
          message: `Escalated a structural concern about ${claimId} to the Curator.`,
        });
      }

      default:
        return `Error: Unknown steward tool: ${toolName}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
