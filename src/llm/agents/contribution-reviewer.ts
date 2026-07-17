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
import { withAgent } from "../usage-context.js";

// Tag every LLM call in this agent for the per-token meter (#70); the
// wrapper keeps attribution correct for any call site.
export function runContributionReview(
  input: Parameters<typeof runContributionReviewImpl>[0]
): ReturnType<typeof runContributionReviewImpl> {
  return withAgent("contribution_reviewer", () => runContributionReviewImpl(input));
}

async function runContributionReviewImpl(input: {
  contributionId: string;
  model?: string;
}): Promise<void> {
  const config = loadConfig();
  const model = input.model ?? config.governanceModel;

  const tools = [
    ...getGovernanceToolDefinitions(),
    ...getReviewerToolDefinitions(),
  ];

  const userMessage = `A contribution has been submitted for review.

Contribution ID: ${input.contributionId}

Review it:
1. Load it with get_contribution_details.
2. If it targets an existing claim, read that claim with get_claim_with_context. Intake contributions have no target claim; the proposal itself is what you are judging.
3. Check the contributor with get_contributor_profile.
4. Evaluate against the policies and record your decision with record_review_decision.
5. If you accepted a contribution on an existing claim, call notify_claim_steward. Accepted intake is materialized automatically — no steward call.
6. If you escalated, also call escalate_to_arbitrator; that call is what enqueues arbitration.`;

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
