import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  assessments,
  claimInstances,
  sources,
} from "../db/schema.js";
import { claimSearchParams, claimGetParams, claimProposeBody, claimPatchBody } from "../schemas/claim.js";
import { hybridSearch } from "../services/search-service.js";
import { getClaimTree, getSubclaimCount } from "../services/tree-service.js";
import { getClaimById, proposeClaim } from "../services/claim-service.js";
import { addArgument, getArgumentsForClaim } from "../services/argument-service.js";

const claimSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    text: { type: "string" },
    claim_type: { type: "string" },
    state: { type: "string" },
    decomposition_status: { type: "string" },
    created_by: { type: "string" },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
} as const;

const errorEnvelope = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        request_id: { type: "string" },
      },
    },
  },
} as const;

export async function claimRoutes(app: FastifyInstance): Promise<void> {
  // GET /claims/search/:query
  app.get<{ Params: { query: string }; Querystring: Record<string, string> }>(
    "/search/:query",
    {
      schema: {
        tags: ["claims"],
        summary: "Search claims by text query",
        params: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
        },
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            min_similarity: { type: "number", minimum: 0, maximum: 1, default: 0.3 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", format: "uuid" },
                    text: { type: "string" },
                    claim_type: { type: "string" },
                    state: { type: "string" },
                    similarity_score: { type: "number" },
                    assessment_status: { type: "string", nullable: true },
                    assessment_confidence: { type: "number", nullable: true },
                  },
                },
              },
              total: { type: "integer" },
            },
          },
        },
      },
      handler: async (request, reply) => {
        const { query } = request.params;
        const params = claimSearchParams.parse(request.query);

        const { results, total } = await hybridSearch(query, {
          limit: params.limit,
          minSimilarity: params.min_similarity,
        });

        return reply.send({ results, total });
      },
    }
  );

  // GET /claims/:claim_id
  app.get<{ Params: { claim_id: string }; Querystring: Record<string, string> }>(
    "/:claim_id",
    {
      schema: {
        tags: ["claims"],
        summary: "Get claim details",
        params: {
          type: "object",
          properties: {
            claim_id: { type: "string", format: "uuid" },
          },
        },
        querystring: {
          type: "object",
          properties: {
            information_depth: { type: "string", enum: ["cursory", "standard", "deep"], default: "standard" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              claim: claimSchema,
              assessment: { type: "object", nullable: true },
              subclaim_count: { type: "integer" },
              tree: { type: "object", nullable: true },
              arguments: { type: "array", nullable: true },
              instances: { type: "array", nullable: true },
            },
          },
          404: errorEnvelope,
        },
      },
      handler: async (request, reply) => {
        const { claim_id } = request.params;
        const params = claimGetParams.parse(request.query);

        const claim = await getClaimById(claim_id);
        if (!claim) {
          return reply.code(404).send({
            error: {
              code: "NOT_FOUND",
              message: "Claim not found",
              request_id: request.id,
            },
          });
        }

        // Always: assessment + subclaim count
        const db = getDb();
        const [assessment] = await db
          .select()
          .from(assessments)
          .where(eq(assessments.claimId, claim_id))
          .limit(1);

        const subclaimCount = await getSubclaimCount(claim_id);

        const response: Record<string, unknown> = {
          claim: formatClaim(claim),
          assessment: assessment ? formatAssessment(assessment) : null,
          subclaim_count: subclaimCount,
        };

        // Standard: + full tree
        if (
          params.information_depth === "standard" ||
          params.information_depth === "deep"
        ) {
          response.tree = await getClaimTree(claim_id);
        }

        // Deep: + arguments + source instances
        if (params.information_depth === "deep") {
          const args = await getArgumentsForClaim(claim_id);
          response.arguments = args.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            stance: a.stance,
            content: a.content,
            evidence_urls: a.evidenceUrls,
            created_by: a.createdBy,
            created_at: a.createdAt.toISOString(),
          }));

          const instances = await db
            .select({
              id: claimInstances.id,
              source_id: claimInstances.sourceId,
              original_text: claimInstances.originalText,
              context: claimInstances.context,
              confidence: claimInstances.confidence,
              source_title: sources.title,
              source_url: sources.url,
            })
            .from(claimInstances)
            .innerJoin(sources, eq(claimInstances.sourceId, sources.id))
            .where(eq(claimInstances.claimId, claim_id));

          response.instances = instances;
        }

        return reply.send(response);
      },
    }
  );

  // POST /claims/propose
  app.post("/propose", {
    schema: {
      tags: ["claims"],
      summary: "Propose a new claim with an initial argument",
      body: {
        type: "object",
        required: ["claim", "argument"],
        properties: {
          claim: { type: "string", minLength: 1, maxLength: 2000 },
          argument: { type: "string", minLength: 1, maxLength: 5000 },
        },
      },
      response: {
        201: {
          type: "object",
          properties: {
            claim: claimSchema,
            argument: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                stance: { type: "string" },
                content: { type: "string" },
                created_by: { type: "string" },
                created_at: { type: "string", format: "date-time" },
              },
            },
            job_id: { type: "string", format: "uuid" },
          },
        },
      },
    },
    preHandler: app.authenticate,
    handler: async (request, reply) => {
      const body = claimProposeBody.parse(request.body);
      const result = await proposeClaim({
        claim: body.claim,
        argument: body.argument,
      });

      return reply.code(201).send({
        claim: formatClaim(result.claim),
        argument: {
          id: result.argument.id,
          stance: result.argument.stance,
          content: result.argument.content,
          created_by: result.argument.createdBy,
          created_at: result.argument.createdAt.toISOString(),
        },
        job_id: result.jobId,
      });
    },
  });

  // PATCH /claims/:claim_id
  app.patch<{ Params: { claim_id: string } }>("/:claim_id", {
    schema: {
      tags: ["claims"],
      summary: "Add an argument to a claim",
      params: {
        type: "object",
        properties: {
          claim_id: { type: "string", format: "uuid" },
        },
      },
      body: {
        type: "object",
        required: ["argument"],
        properties: {
          argument: {
            type: "object",
            required: ["stance", "content"],
            properties: {
              stance: { type: "string", enum: ["for", "against"] },
              content: { type: "string", minLength: 1, maxLength: 5000 },
              evidence_urls: { type: "array", items: { type: "string", format: "uri" } },
            },
          },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            argument: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                claim_id: { type: "string", format: "uuid" },
                stance: { type: "string" },
                content: { type: "string" },
                evidence_urls: { type: "array", items: { type: "string" } },
                created_by: { type: "string" },
                created_at: { type: "string", format: "date-time" },
              },
            },
          },
        },
        404: errorEnvelope,
      },
    },
    preHandler: app.authenticate,
    handler: async (request, reply) => {
      const { claim_id } = request.params;
      const body = claimPatchBody.parse(request.body);

      const claim = await getClaimById(claim_id);
      if (!claim) {
        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Claim not found",
            request_id: request.id,
          },
        });
      }

      const argument = await addArgument({
        claimId: claim_id,
        stance: body.argument.stance,
        content: body.argument.content,
        evidenceUrls: body.argument.evidence_urls,
      });

      return reply.send({
        argument: {
          id: argument.id,
          claim_id: argument.claimId,
          stance: argument.stance,
          content: argument.content,
          evidence_urls: argument.evidenceUrls,
          created_by: argument.createdBy,
          created_at: argument.createdAt.toISOString(),
        },
      });
    },
  });
}

function formatClaim(claim: { id: string; text: string; claimType: string; state: string; decompositionStatus: string; createdBy: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: claim.id,
    text: claim.text,
    claim_type: claim.claimType,
    state: claim.state,
    decomposition_status: claim.decompositionStatus,
    created_by: claim.createdBy,
    created_at: claim.createdAt.toISOString(),
    updated_at: claim.updatedAt.toISOString(),
  };
}

function formatAssessment(a: { id: string; status: string; confidence: number; reasoningTrace: string; subclaimSummary: unknown; assessedAt: Date }) {
  return {
    id: a.id,
    status: a.status,
    confidence: a.confidence,
    reasoning_trace: a.reasoningTrace,
    subclaim_summary: a.subclaimSummary,
    assessed_at: a.assessedAt.toISOString(),
  };
}
