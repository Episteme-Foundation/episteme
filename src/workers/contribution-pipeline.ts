/**
 * Contribution pipeline worker.
 * Thin wrapper that invokes the Contribution Reviewer agent.
 */
import type { ContributionMessage } from "../services/queue-service.js";
import { runContributionReview } from "../llm/agents/contribution-reviewer.js";

export async function handleContributionMessage(
  message: ContributionMessage
): Promise<void> {
  await runContributionReview({
    contributionId: message.contributionId,
  });
}
