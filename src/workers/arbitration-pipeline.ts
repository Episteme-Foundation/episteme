/**
 * Arbitration pipeline worker.
 * Thin wrapper that invokes the Dispute Arbitrator agent.
 */
import type { ArbitrationMessage } from "../services/queue-service.js";
import { runArbitration } from "../llm/agents/dispute-arbitrator.js";

export async function handleArbitrationMessage(
  message: ArbitrationMessage
): Promise<void> {
  await runArbitration({
    contributionId: message.contributionId,
    trigger: message.trigger,
    appealId: message.appealId,
  });
}
