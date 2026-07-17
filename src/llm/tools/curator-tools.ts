/**
 * Action tools for the Curator — the graph-level agent that owns the connective
 * tissue between claims (constitution Part VII, §18).
 *
 * Two kinds of action:
 *  - **Re-individuation surgery** (merge/split): the Curator mutates nodes, edges,
 *    and instances directly via the reconciliation service. That IS the operation.
 *    Every surgery ends by handing the affected claims to their Stewards.
 *  - **Steady-state suggestions**: a routine decomposition edge into a claim is
 *    owned by that claim's Steward, so the Curator never writes it directly — it
 *    enqueues the parent's Steward to adopt it.
 */
import type Anthropic from "@anthropic-ai/sdk";
type Tool = Anthropic.Tool;
import {
  mergeClaims,
  createClaim,
  addRelationshipEdge,
  removeRelationshipEdge,
  reassignInstance,
} from "../../services/reconciliation-service.js";
import { enqueueSteward } from "../../services/queue-service.js";

const RELATION_ENUM = [
  "requires",
  "supports",
  "contradicts",
  "specifies",
  "defines",
  "presupposes",
] as const;

export function getCuratorToolDefinitions(): Tool[] {
  return [
    {
      name: "merge_claims",
      description:
        "Merge two claims that are one proposition (a duplicate or counterpart the " +
        "Matcher missed). Moves the loser's instances, arguments, and edges onto " +
        "the survivor and marks the loser a merged alias. After merging, notify " +
        "the survivor's Steward.",
      input_schema: {
        type: "object" as const,
        properties: {
          survivor_id: { type: "string", description: "The claim that remains" },
          loser_id: { type: "string", description: "The claim merged into the survivor" },
          stance_relation: {
            type: "string",
            enum: ["same", "opposed"],
            description:
              "'same' if both state the proposition the same way; 'opposed' if the " +
              "loser is the survivor's negation/counterpart, which flips the moved " +
              "instance and argument stances. Any value other than 'opposed' is " +
              "treated as 'same'.",
          },
          reasoning: { type: "string", description: "Why these are one claim" },
        },
        required: ["survivor_id", "loser_id", "stance_relation", "reasoning"],
      },
    },
    {
      name: "create_claim",
      description:
        "Create a new claim node (embedded immediately). Use for the split-off " +
        "half of a split; match_claim first in case it already exists.",
      input_schema: {
        type: "object" as const,
        properties: {
          text: { type: "string", description: "Canonical text of the new claim" },
          claim_type: {
            type: "string",
            description:
              "One of empirical_verifiable, empirical_derived, definitional, " +
              "evaluative, causal, normative. Defaults to empirical_derived.",
          },
        },
        required: ["text"],
      },
    },
    {
      name: "add_relationship_edge",
      description:
        "Add an edge between two existing claims as part of a merge/split surgery. " +
        "For an edge into a claim you are not reconciling, use " +
        "suggest_edge_to_steward instead.",
      input_schema: {
        type: "object" as const,
        properties: {
          parent_id: { type: "string", description: "Parent claim UUID" },
          child_id: { type: "string", description: "Child (subclaim) UUID" },
          relation: { type: "string", enum: [...RELATION_ENUM], description: "Relationship type" },
          reasoning: { type: "string", description: "Why this edge holds" },
        },
        required: ["parent_id", "child_id", "relation", "reasoning"],
      },
    },
    {
      name: "remove_relationship_edge",
      description:
        "Remove an edge between two claims (one relation type, or all). Used when " +
        "redistributing edges during a split.",
      input_schema: {
        type: "object" as const,
        properties: {
          parent_id: { type: "string", description: "Parent claim UUID" },
          child_id: { type: "string", description: "Child claim UUID" },
          relation: {
            type: "string",
            enum: [...RELATION_ENUM],
            description: "Specific relation type to remove (omit to remove all)",
          },
        },
        required: ["parent_id", "child_id"],
      },
    },
    {
      name: "reassign_instance",
      description:
        "Move a source instance from its current claim to another. Used when " +
        "redistributing instances across the two claims of a split.",
      input_schema: {
        type: "object" as const,
        properties: {
          instance_id: { type: "string", description: "The instance UUID to move" },
          to_claim_id: { type: "string", description: "The claim to move it to" },
        },
        required: ["instance_id", "to_claim_id"],
      },
    },
    {
      name: "suggest_edge_to_steward",
      description:
        "Propose a decomposition edge into a claim you are not reconciling. " +
        "Writes nothing; it enqueues the parent claim's Steward to consider " +
        "adopting the edge.",
      input_schema: {
        type: "object" as const,
        properties: {
          parent_id: { type: "string", description: "The claim that would gain the subclaim" },
          child_id: { type: "string", description: "The existing claim to suggest as a subclaim" },
          relation: { type: "string", enum: [...RELATION_ENUM], description: "Suggested relationship type" },
          reasoning: { type: "string", description: "Why this dependency likely holds" },
        },
        required: ["parent_id", "child_id", "relation", "reasoning"],
      },
    },
    {
      name: "notify_steward",
      description:
        "Hand a claim to its Steward with instructions (e.g. 'merged a counterpart " +
        "into you — reconcile the flipped arguments and re-assess', or 'you were " +
        "split from another claim — re-derive your decomposition'). Required after " +
        "every merge (the survivor) and every split (both claims).",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: { type: "string", description: "The claim whose Steward to notify" },
          instructions: { type: "string", description: "What the Steward should do" },
        },
        required: ["claim_id", "instructions"],
      },
    },
  ];
}

export async function executeCuratorTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (toolName) {
      case "merge_claims": {
        const result = await mergeClaims({
          survivorId: String(input.survivor_id),
          loserId: String(input.loser_id),
          stanceRelation: input.stance_relation === "opposed" ? "opposed" : "same",
          reasoning: String(input.reasoning ?? ""),
        });
        return JSON.stringify({
          success: true,
          message: `Merged ${result.loserId} into ${result.survivorId}. Now notify the survivor's Steward to reconcile and re-assess.`,
          survivor_id: result.survivorId,
        });
      }

      case "create_claim": {
        const { id } = await createClaim({
          text: String(input.text),
          claimType: input.claim_type ? String(input.claim_type) : undefined,
        });
        return JSON.stringify({ success: true, claim_id: id });
      }

      case "add_relationship_edge": {
        const { added } = await addRelationshipEdge({
          parentId: String(input.parent_id),
          childId: String(input.child_id),
          relationType: String(input.relation),
          reasoning: String(input.reasoning ?? ""),
        });
        return JSON.stringify({
          success: true,
          added,
          message: added ? "Edge added." : "Edge already existed or was a self-edge.",
        });
      }

      case "remove_relationship_edge": {
        const { removed } = await removeRelationshipEdge({
          parentId: String(input.parent_id),
          childId: String(input.child_id),
          relationType: input.relation ? String(input.relation) : undefined,
        });
        return JSON.stringify({ success: true, removed });
      }

      case "reassign_instance": {
        const { reassigned } = await reassignInstance({
          instanceId: String(input.instance_id),
          toClaimId: String(input.to_claim_id),
        });
        return JSON.stringify({ success: reassigned, reassigned });
      }

      case "suggest_edge_to_steward": {
        const parentId = String(input.parent_id);
        await enqueueSteward({
          claimId: parentId,
          trigger: "curator_change",
          context:
            `The Curator suggests adding claim ${String(input.child_id)} as a ` +
            `subclaim (${String(input.relation)}): ${String(input.reasoning ?? "")}. ` +
            `If apt, attach it with add_relationship_edge.`,
        });
        return JSON.stringify({
          success: true,
          message: `Suggested edge to the Steward of ${parentId}.`,
        });
      }

      case "notify_steward": {
        const claimId = String(input.claim_id);
        await enqueueSteward({
          claimId,
          trigger: "curator_change",
          context: String(input.instructions ?? ""),
        });
        return JSON.stringify({
          success: true,
          message: `Notified the Steward of ${claimId}.`,
        });
      }

      default:
        return `Error: Unknown curator tool: ${toolName}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
