/**
 * Dispute Arbitrator agent.
 *
 * Handles escalated reviews, appeals, and complex disputes that require
 * deeper analysis or multi-model consensus. Acts through tools -- no
 * structured return value.
 */
import { toolUseLoop } from "../client.js";
import { getDisputeArbitratorSystemPrompt } from "../prompts/dispute-arbitrator.js";
import {
  getGovernanceToolDefinitions,
  executeGovernanceTool,
} from "../tools/governance-tools.js";
import {
  getArbitratorToolDefinitions,
  executeArbitratorTool,
} from "../tools/arbitrator-tools.js";
import { loadConfig } from "../../config.js";

export async function runArbitration(input: {
  contributionId: string;
  trigger: string;
  appealId?: string;
  model?: string;
}): Promise<void> {
  const config = loadConfig();
  const model = input.model ?? config.governanceModel;

  const tools = [
    ...getGovernanceToolDefinitions(),
    ...getArbitratorToolDefinitions(),
  ];

  let userMessage = `You have been called to arbitrate a dispute.

Trigger: ${input.trigger}
Contribution ID: ${input.contributionId}`;

  if (input.appealId) {
    userMessage += `\nAppeal ID: ${input.appealId}`;
  }

  userMessage += `

Please:
1. Use get_contribution_details to understand the contribution and any existing review.
2. Use get_claim_with_context to understand the target claim in full.
3. Use get_contributor_profile for the contributor's history.
4. Use get_recent_decisions to check for precedent in similar cases.
5. Apply your decision framework: gather context, analyze policies, assess evidence, decide.
6. For high-stakes decisions, consider using request_second_opinion for multi-model consensus.
7. Record your decision using record_arbitration_decision.
8. Use notify_claim_steward if the outcome affects the claim.
9. Use flag_for_human_review if the situation exceeds automated capacity.`;

  await toolUseLoop({
    initialMessages: [{ role: "user", content: userMessage }],
    tools,
    system: getDisputeArbitratorSystemPrompt(),
    model,
    maxTokens: 8192,
    maxIterations: 12,
    executeTool: async (name, toolInput) => {
      const governanceTools = getGovernanceToolDefinitions().map((t) => t.name);
      if (governanceTools.includes(name)) {
        return executeGovernanceTool(name, toolInput);
      }
      return executeArbitratorTool(name, toolInput);
    },
  });
}
