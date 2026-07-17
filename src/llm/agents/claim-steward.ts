/**
 * Claim Steward agent.
 *
 * Owns a claim over time: it ASSESSES the claim it stewards (there is no separate
 * Assessor — see #30), maintains its canonical form and decomposition, integrates
 * accepted contributions, and re-judges as evidence and depended-on claims change.
 * It always has web_search and may traverse the graph. Acts through tools -- no
 * structured return value.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { toolUseLoop } from "../client.js";
import { getClaimStewardSystemPrompt } from "../prompts/claim-steward.js";
import {
  getGraphToolDefinitions,
  executeGraphTool,
} from "../tools/graph-tools.js";
import {
  getClaimContextToolDefinitions,
  executeGovernanceTool,
} from "../tools/governance-tools.js";
import {
  getStewardToolDefinitions,
  executeStewardTool,
} from "../tools/steward-tools.js";
import {
  getMatcherToolDefinition,
  executeMatcherTool,
} from "../tools/matcher-tools.js";
import { loadConfig } from "../../config.js";
import { withAgent } from "../usage-context.js";

// Tag every LLM call in this agent for the per-token meter (#70); the
// wrapper keeps attribution correct for any call site.
export function runClaimSteward(
  input: Parameters<typeof runClaimStewardImpl>[0]
): ReturnType<typeof runClaimStewardImpl> {
  return withAgent("steward", () => runClaimStewardImpl(input));
}

async function runClaimStewardImpl(input: {
  trigger: string;
  claimId: string;
  context: string;
  model?: string;
}): Promise<void> {
  const config = loadConfig();
  const model = input.model ?? config.stewardModel;

  // The steward always has web search — it may need fresh external evidence to
  // assess any claim, atomic or compound (#30).
  const webSearchTool: Anthropic.Messages.WebSearchTool20260209 = {
    type: "web_search_20260209",
    name: "web_search",
    max_uses: 5,
  };

  // Same read/navigation set the Curator gets (#69): the Steward owns a claim's
  // structure, so it must be able to read parents, subclaims, and neighbors.
  const graphTools = getGraphToolDefinitions();
  const graphNames = new Set(graphTools.map((t) => t.name));

  // Claim-scoped subset only: the contribution/contributor/decision tools in
  // the full governance bundle are never referenced by the Steward's prompt.
  const claimContextTools = getClaimContextToolDefinitions();
  const claimContextNames = new Set(claimContextTools.map((t) => t.name));

  const tools = [
    ...graphTools,
    ...claimContextTools,
    ...getStewardToolDefinitions(),
    getMatcherToolDefinition(),
    webSearchTool,
  ];

  const isInitial = input.trigger === "structure_and_assess";

  const structureStep = isInitial
    ? `2. Decompose the claim (this is its first pass): identify its load-bearing
   dependencies and the strongest considerations for and against it. For each
   dependency, call match_claim first; attach an existing match with
   add_relationship_edge, and create only genuinely novel propositions with
   add_decomposition_edge (with an importance score). If the claim is genuinely
   simple, leave it atomic.`
    : `2. Re-assess in light of what changed. Adjust structure only if a
   load-bearing dependency is genuinely missing (match_claim first); do not
   re-decompose from scratch.`;

  const iterationBudget = config.stewardMaxIterations;
  let newSubclaimsThisRun = 0;

  const userMessage = `Steward this claim.

Trigger: ${input.trigger}
Claim ID: ${input.claimId}
Context: ${input.context}

Budget: up to ${iterationBudget} tool-use iterations — a generous backstop, not
a target, but a hard limit. Record your assessment (update_claim_assessment)
and log your decision (log_stewardship_decision) before you approach it; if
warned that few iterations remain, stop exploring and record your conclusion.

1. Use get_claim_with_context to see the claim, its subclaims and their
   assessments, its source instances (note each one's affirm/deny stance), and
   any current assessment.
${structureStep}
3. Gauge the claim's importance, scale your effort to it, and record it with
   set_claim_importance where your estimate differs from the stored value.
4. Reach a holistic assessment and record it with update_claim_assessment,
   providing both texts (assessment and reasoning_trace).
5. Improve the canonical form with update_canonical_form if needed, log the
   pass with log_stewardship_decision, and if the assessment materially
   changed, call notify_dependent_stewards.`;

  await toolUseLoop({
    initialMessages: [{ role: "user", content: userMessage }],
    tools,
    system: getClaimStewardSystemPrompt(),
    model,
    maxTokens: 8192,
    // A pure runaway backstop — judgment, not the iteration count, decides when
    // to stop. The Steward now decomposes AND assesses in one loop, so this is
    // set high; real spend is bounded by stewardMaxRuns + the LLM budget tracker.
    maxIterations: iterationBudget,
    iterationBudgetNotice: {
      warnWithin: 3,
      message: (remaining) =>
        `⚠ Stewardship budget notice: ${remaining} tool-use iteration(s) remain ` +
        `before you are stopped. Wrap up now — if you have not yet recorded your ` +
        `assessment with update_claim_assessment and logged it with ` +
        `log_stewardship_decision, do so on your next turn so your work is saved.`,
    },
    executeTool: async (name, toolInput) => {
      if (name === "match_claim") {
        return executeMatcherTool(name, toolInput);
      }
      if (graphNames.has(name)) {
        return executeGraphTool(name, toolInput);
      }
      if (claimContextNames.has(name)) {
        return executeGovernanceTool(name, toolInput);
      }
      // Blast-radius backstop (#157 phase 3): cap the NEW subclaims one run
      // may mint. Like the iteration cap this is a runaway guard, not a
      // target — the judgment about how far to decompose stays with the
      // Steward (and the importance brake bounds recursion). Linking
      // existing claims (add_relationship_edge) is never capped.
      if (name === "add_decomposition_edge") {
        const cap = config.stewardMaxNewSubclaimsPerRun;
        if (cap > 0 && newSubclaimsThisRun >= cap) {
          return JSON.stringify({
            success: false,
            message:
              `This run has already minted ${newSubclaimsThisRun} new subclaims — the ` +
              `per-run backstop (${cap}). Do not create more in this pass: link any ` +
              `remaining dependencies that already exist with add_relationship_edge, ` +
              `note the rest in your reasoning trace, and proceed to your assessment. ` +
              `A future stewardship pass can continue the decomposition.`,
          });
        }
        newSubclaimsThisRun++;
      }
      return executeStewardTool(name, toolInput);
    },
  });
}
