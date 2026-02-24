/**
 * Contribution Reviewer agent.
 *
 * Evaluates contributions against policies and decides whether to accept,
 * reject, or escalate. Acts through tools -- no structured return value.
 */
import { toolUseLoop } from "../client.js";
import { getContributionReviewerSystemPrompt } from "../prompts/contribution-reviewer.js";
import {
  getGovernanceToolDefinitions,
  executeGovernanceTool,
} from "../tools/governance-tools.js";
import {
  getReviewerToolDefinitions,
  executeReviewerTool,
} from "../tools/reviewer-tools.js";
import { loadConfig } from "../../config.js";

export async function runContributionReview(input: {
  contributionId: string;
  model?: string;
}): Promise<void> {
  const config = loadConfig();
  const model = input.model ?? config.governanceModel;

  const tools = [
    ...getGovernanceToolDefinitions(),
    ...getReviewerToolDefinitions(),
  ];

  const userMessage = `A new contribution has been submitted for review.

Contribution ID: ${input.contributionId}

Please review this contribution:
1. Use get_contribution_details to load the contribution and understand what is being proposed.
2. Use get_claim_with_context to understand the target claim.
3. Use get_contributor_profile to understand the contributor's history and trust level.
4. Evaluate the contribution against policies.
5. Record your decision using record_review_decision (accept, reject, or escalate).
6. If you accept, use notify_claim_steward so the steward can integrate the change.
7. If you escalate, use escalate_to_arbitrator with your reasoning.`;

  await toolUseLoop({
    initialMessages: [{ role: "user", content: userMessage }],
    tools,
    system: getContributionReviewerSystemPrompt(),
    model,
    maxTokens: 8192,
    maxIterations: 8,
    executeTool: async (name, toolInput) => {
      const governanceTools = getGovernanceToolDefinitions().map((t) => t.name);
      if (governanceTools.includes(name)) {
        return executeGovernanceTool(name, toolInput);
      }
      return executeReviewerTool(name, toolInput);
    },
  });
}
