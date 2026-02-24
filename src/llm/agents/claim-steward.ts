/**
 * Claim Steward agent.
 *
 * Manages claims over time: re-evaluates assessments when subclaims change,
 * integrates accepted contributions, and maintains canonical forms.
 * Acts through tools -- no structured return value.
 */
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

  const tools = [
    ...getGovernanceToolDefinitions(),
    ...getStewardToolDefinitions(),
  ];

  const userMessage = `You have been triggered to steward a claim.

Trigger: ${input.trigger}
Claim ID: ${input.claimId}
Context: ${input.context}

Please:
1. Use get_claim_with_context to understand the claim's current state, subclaims, and assessment.
2. Evaluate whether any action is needed based on the trigger and context.
3. If the assessment should change, use update_claim_assessment with your reasoning.
4. If the canonical form needs updating, use update_canonical_form.
5. If you discover missing subclaims, use add_decomposition_edge.
6. Log your decision using log_stewardship_decision.
7. If you change the assessment, use notify_dependent_stewards so parent claims can be evaluated.`;

  await toolUseLoop({
    initialMessages: [{ role: "user", content: userMessage }],
    tools,
    system: getClaimStewardSystemPrompt(),
    model,
    maxTokens: 8192,
    maxIterations: 10,
    executeTool: async (name, toolInput) => {
      const governanceTools = getGovernanceToolDefinitions().map((t) => t.name);
      if (governanceTools.includes(name)) {
        return executeGovernanceTool(name, toolInput);
      }
      return executeStewardTool(name, toolInput);
    },
  });
}
