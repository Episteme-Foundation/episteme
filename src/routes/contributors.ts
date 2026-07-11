/**
 * Public contributor surfaces (#71): the kudos leaderboard and per-contributor
 * profiles. Reads stay open (no auth), like claim reads — recognition only
 * works if it's visible. Private account fields (email, external auth subject)
 * are never exposed here; that's what /users/me is for.
 */
import type { FastifyInstance } from "fastify";
import { getContributorById } from "../services/contributor-service.js";
import { listContributions } from "../services/contribution-service.js";
import {
  getLeaderboard,
  listKudosEvents,
} from "../services/kudos-service.js";
import { trustLevelFor } from "../services/reputation-service.js";

export async function contributorRoutes(app: FastifyInstance): Promise<void> {
  // GET /contributors — the kudos leaderboard.
  app.get<{ Querystring: { limit?: number } }>("/", {
    schema: {
      tags: ["contributors"],
      summary: "Top contributors by kudos",
      querystring: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            contributors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  display_name: { type: "string" },
                  avatar_url: { type: "string", nullable: true },
                  kudos: { type: "integer" },
                  reputation_score: { type: "number" },
                  trust_level: { type: "string" },
                  contributions_accepted: { type: "integer" },
                  member_since: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const limit = request.query.limit ?? 20;
      const rows = await getLeaderboard(limit);
      return reply.send({
        contributors: rows.map((r) => ({
          id: r.id,
          display_name: r.displayName,
          avatar_url: r.avatarUrl,
          kudos: r.kudos,
          reputation_score: r.reputationScore,
          trust_level: trustLevelFor(r.reputationScore, false),
          contributions_accepted: r.contributionsAccepted,
          member_since: r.createdAt.toISOString(),
        })),
      });
    },
  });

  // GET /contributors/:id — public profile with standing and recent activity.
  app.get<{ Params: { id: string } }>("/:id", {
    schema: {
      tags: ["contributors"],
      summary: "Public contributor profile",
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
            // Enumerated so Fastify's serializer keeps the fields (an empty
            // object schema strips everything).
            contributor: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                display_name: { type: "string" },
                avatar_url: { type: "string", nullable: true },
                member_since: { type: "string", format: "date-time" },
                reputation_score: { type: "number" },
                trust_level: { type: "string" },
                kudos: { type: "integer" },
                contribution_standing: { type: "string" },
                is_verified: { type: "boolean" },
                is_suspended: { type: "boolean" },
                contributions_accepted: { type: "integer" },
                contributions_rejected: { type: "integer" },
                contributions_escalated: { type: "integer" },
                total_contributions: { type: "integer" },
                acceptance_rate: { type: "integer", nullable: true },
              },
            },
            recent_contributions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  claim_id: { type: "string", format: "uuid" },
                  contribution_type: { type: "string" },
                  review_status: { type: "string" },
                  submitted_at: { type: "string", format: "date-time" },
                },
              },
            },
            recent_kudos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  contribution_id: {
                    type: "string",
                    format: "uuid",
                    nullable: true,
                  },
                  amount: { type: "integer" },
                  reason: { type: "string" },
                  awarded_by: { type: "string" },
                  created_at: { type: "string", format: "date-time" },
                },
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
    handler: async (request, reply) => {
      const contributor = await getContributorById(request.params.id);
      if (!contributor) {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "Contributor not found" },
        });
      }

      const [contributions, kudos] = await Promise.all([
        listContributions({
          contributorId: contributor.id,
          limit: 10,
          offset: 0,
        }),
        listKudosEvents(contributor.id, 10),
      ]);

      const total =
        contributor.contributionsAccepted +
        contributor.contributionsRejected +
        contributor.contributionsEscalated;

      return reply.send({
        contributor: {
          id: contributor.id,
          display_name: contributor.displayName,
          avatar_url: contributor.avatarUrl,
          member_since: contributor.createdAt.toISOString(),
          reputation_score: contributor.reputationScore,
          trust_level: trustLevelFor(
            contributor.reputationScore,
            contributor.isSuspended
          ),
          kudos: contributor.kudos,
          contribution_standing: contributor.contributionStanding,
          is_verified: contributor.isVerified,
          is_suspended: contributor.isSuspended,
          contributions_accepted: contributor.contributionsAccepted,
          contributions_rejected: contributor.contributionsRejected,
          contributions_escalated: contributor.contributionsEscalated,
          total_contributions: total,
          acceptance_rate:
            total > 0
              ? Math.round((contributor.contributionsAccepted / total) * 100)
              : null,
        },
        recent_contributions: contributions.map((c) => ({
          id: c.id,
          claim_id: c.claimId,
          contribution_type: c.contributionType,
          review_status: c.reviewStatus,
          submitted_at: c.submittedAt.toISOString(),
        })),
        recent_kudos: kudos.map((k) => ({
          id: k.id,
          contribution_id: k.contributionId,
          amount: k.amount,
          reason: k.reason,
          awarded_by: k.awardedBy,
          created_at: k.createdAt.toISOString(),
        })),
      });
    },
  });
}
