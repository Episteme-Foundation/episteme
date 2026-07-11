import type { FastifyInstance } from "fastify";
import {
  createContributionBody,
  listContributionsParams,
} from "../schemas/governance.js";
import {
  createContribution,
  getContributionById,
  listContributions,
  getReviewForContribution,
} from "../services/contribution-service.js";
import { getOrCreateContributor } from "../services/contributor-service.js";
import { getClaimById } from "../services/claim-service.js";
import { enqueueContribution } from "../services/queue-service.js";
import { checkContributionRateLimit } from "../services/reputation-service.js";

export async function contributionRoutes(app: FastifyInstance): Promise<void> {
  // POST /contributions
  app.post("/", {
    schema: {
      tags: ["contributions"],
      summary: "Submit a contribution for review",
      body: {
        type: "object",
        required: ["claim_id", "contribution_type", "content"],
        properties: {
          claim_id: { type: "string", format: "uuid" },
          contributor_display_name: { type: "string" },
          contribution_type: { type: "string" },
          content: { type: "string" },
          evidence_urls: { type: "array", items: { type: "string" } },
          merge_target_claim_id: { type: "string", format: "uuid" },
          proposed_canonical_form: { type: "string" },
        },
      },
      response: {
        201: {
          type: "object",
          properties: {
            contribution: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                claim_id: { type: "string", format: "uuid" },
                contributor_id: { type: "string", format: "uuid" },
                contribution_type: { type: "string" },
                content: { type: "string" },
                evidence_urls: { type: "array", items: { type: "string" } },
                submitted_at: { type: "string", format: "date-time" },
                review_status: { type: "string" },
              },
            },
          },
        },
        402: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
        403: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
        404: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
        429: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
    },
    preHandler: app.authenticate,
    handler: async (request, reply) => {
      const body = createContributionBody.parse(request.body);

      // Verify claim exists
      const claim = await getClaimById(body.claim_id);
      if (!claim) {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "Claim not found" },
        });
      }

      // The acting contributor comes from the authenticated API key (issue
      // #10) — never from the request body, which would let any caller act as
      // any contributor.
      const externalId = request.contributorExternalId;
      if (!externalId) {
        return reply.code(403).send({
          error: {
            code: "NO_CONTRIBUTOR_IDENTITY",
            message: "API key is not bound to a contributor identity",
          },
        });
      }

      const contributor = await getOrCreateContributor({
        externalId,
        displayName: body.contributor_display_name ?? externalId,
      });

      // Check if contributor is suspended
      if (contributor.isSuspended) {
        return reply.code(403).send({
          error: {
            code: "CONTRIBUTOR_SUSPENDED",
            message: `Contributor is suspended: ${contributor.suspensionReason ?? "No reason provided"}`,
          },
        });
      }

      // Good-faith-free / bad-faith-pay (#71): a suspected-bad-faith flag put
      // this contributor in must-pay standing. The deposit rail doesn't exist
      // yet (mirrors the consumer credits seam), so contributing is blocked
      // with 402 until the flag is overturned on appeal — which stays open.
      if (contributor.contributionStanding === "must_pay") {
        return reply.code(402).send({
          error: {
            code: "DEPOSIT_REQUIRED",
            message:
              "A suspected bad-faith contribution moved this account to " +
              "pay-to-contribute standing. Deposits are not yet available; " +
              "you can appeal the flag via POST /appeals.",
          },
        });
      }

      // Sybil / flood sandbox (#71): low-reputation and brand-new accounts
      // get a tighter hourly cap.
      const rate = checkContributionRateLimit(contributor);
      if (rate.limited) {
        return reply.code(429).send({
          error: {
            code: "CONTRIBUTION_RATE_LIMITED",
            message: rate.sandboxed
              ? `New and low-reputation accounts are limited to ${rate.limitPerHour} contributions per hour; retry later`
              : `Contribution rate limit (${rate.limitPerHour}/hour) exceeded; retry later`,
          },
        });
      }

      // Create contribution
      const contribution = await createContribution({
        claimId: body.claim_id,
        contributorId: contributor.id,
        contributionType: body.contribution_type,
        content: body.content,
        evidenceUrls: body.evidence_urls,
        mergeTargetClaimId: body.merge_target_claim_id,
        proposedCanonicalForm: body.proposed_canonical_form,
      });

      // Enqueue for review
      await enqueueContribution({ contributionId: contribution.id });

      return reply.code(201).send({
        contribution: formatContribution(contribution),
      });
    },
  });

  // GET /contributions
  app.get<{ Querystring: Record<string, string> }>("/", {
    schema: {
      tags: ["contributions"],
      summary: "List contributions",
      querystring: {
        type: "object",
        properties: {
          claim_id: { type: "string", format: "uuid" },
          status: { type: "string" },
          type: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          offset: { type: "integer", minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            contributions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  claim_id: { type: "string", format: "uuid" },
                  contributor_id: { type: "string", format: "uuid" },
                  contribution_type: { type: "string" },
                  content: { type: "string" },
                  evidence_urls: { type: "array", items: { type: "string" } },
                  submitted_at: { type: "string", format: "date-time" },
                  review_status: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const params = listContributionsParams.parse(request.query);

      const rows = await listContributions({
        claimId: params.claim_id,
        status: params.status,
        contributionType: params.type,
        limit: params.limit,
        offset: params.offset,
      });

      return reply.send({
        contributions: rows.map(formatContribution),
      });
    },
  });

  // GET /contributions/:id
  app.get<{ Params: { id: string } }>("/:id", {
    schema: {
      tags: ["contributions"],
      summary: "Get contribution details",
      params: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            contribution: { type: "object" },
            review: { type: "object", nullable: true },
          },
        },
        404: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const contribution = await getContributionById(request.params.id);
      if (!contribution) {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "Contribution not found" },
        });
      }

      const review = await getReviewForContribution(contribution.id);

      return reply.send({
        contribution: formatContribution(contribution),
        review: review
          ? {
              id: review.id,
              decision: review.decision,
              reasoning: review.reasoning,
              confidence: review.confidence,
              policy_citations: review.policyCitations,
              reviewed_at: review.reviewedAt.toISOString(),
              reviewed_by: review.reviewedBy,
            }
          : null,
      });
    },
  });
}

function formatContribution(c: {
  id: string;
  claimId: string;
  contributorId: string;
  contributionType: string;
  content: string;
  evidenceUrls: string[];
  submittedAt: Date;
  reviewStatus: string;
  mergeTargetClaimId: string | null;
  proposedCanonicalForm: string | null;
}) {
  return {
    id: c.id,
    claim_id: c.claimId,
    contributor_id: c.contributorId,
    contribution_type: c.contributionType,
    content: c.content,
    evidence_urls: c.evidenceUrls,
    submitted_at: c.submittedAt.toISOString(),
    review_status: c.reviewStatus,
    merge_target_claim_id: c.mergeTargetClaimId,
    proposed_canonical_form: c.proposedCanonicalForm,
  };
}
