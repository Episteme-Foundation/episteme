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
  getGovernanceToolDefinitions,
  executeGovernanceTool,
} from "../tools/governance-tools.js";
import {
  getStewardToolDefinitions,
  executeStewardTool,
} from "../tools/steward-tools.js";
import { loadConfig } from "../../config.js";

export async function runClaimSteward(input: {
  trigger: string;
  claimId: string;
  context: string;
  model?: string;
}): Promise<void> {
  const config = loadConfig();
  const model = input.model ?? config.governanceModel;

  // The steward always has web search — it may need fresh external evidence to
  // assess any claim, atomic or compound (#30).
  const webSearchTool: Anthropic.Messages.WebSearchTool20260209 = {
    type: "web_search_20260209",
    name: "web_search",
    max_uses: 5,
  };

  const tools = [
    ...getGovernanceToolDefinitions(),
    ...getStewardToolDefinitions(),
    webSearchTool,
  ];

  const userMessage = `You have been triggered to steward a claim.

Trigger: ${input.trigger}
Claim ID: ${input.claimId}
Context: ${input.context}

You OWN this claim's assessment. Proceed:
1. Use get_claim_with_context to understand the claim, its subclaims and their
   assessments, its source instances (note each instance's affirm/deny stance),
   and its current assessment if any.
2. Gauge the claim's importance — use get_claim_dependents to see how many claims
   rely on it. Scale your effort accordingly: foundational claims warrant deeper
   search and a second, adversarial pass; minor claims warrant a light touch.
3. Reach a holistic assessment using your judgment (no mechanical aggregation).
   Use web_search for external evidence where it would change the verdict.
   Credible instances that BOTH affirm and deny the claim are a strong signal
   toward CONTESTED.
4. Record it with update_claim_assessment (always include reasoning).
5. If the canonical form needs improving, use update_canonical_form. If you find
   a missing load-bearing subclaim, use add_decomposition_edge.
6. Log your decision with log_stewardship_decision.
7. If you established or changed a material assessment, use
   notify_dependent_stewards so claims that depend on this one are re-judged.`;

  await toolUseLoop({
    initialMessages: [{ role: "user", content: userMessage }],
    tools,
    system: getClaimStewardSystemPrompt(),
    model,
    maxTokens: 8192,
    // A backstop only — judgment, not the iteration count, decides when to stop.
    maxIterations: 12,
    executeTool: async (name, toolInput) => {
      const governanceTools = getGovernanceToolDefinitions().map((t) => t.name);
      if (governanceTools.includes(name)) {
        return executeGovernanceTool(name, toolInput);
      }
      return executeStewardTool(name, toolInput);
    },
  });
}
