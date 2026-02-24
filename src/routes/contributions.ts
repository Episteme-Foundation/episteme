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

export async function contributionRoutes(app: FastifyInstance): Promise<void> {
  // POST /contributions
  app.post("/", {
    schema: {
      tags: ["contributions"],
      summary: "Submit a contribution for review",
      body: {
        type: "object",
        required: [
          "claim_id",
          "contributor_external_id",
          "contributor_display_name",
          "contribution_type",
          "content",
        ],
        properties: {
          claim_id: { type: "string", format: "uuid" },
          contributor_external_id: { type: "string" },
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

      // Get or create contributor
      const contributor = await getOrCreateContributor({
        externalId: body.contributor_external_id,
        displayName: body.contributor_display_name,
      });

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
