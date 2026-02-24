/**
 * Steward pipeline worker.
 * Thin wrapper that invokes the Claim Steward agent.
 */
import type { StewardMessage } from "../services/queue-service.js";
import { runClaimSteward } from "../llm/agents/claim-steward.js";

export async function handleStewardMessage(
  message: StewardMessage
): Promise<void> {
  await runClaimSteward({
    trigger: message.trigger,
    claimId: message.claimId,
    context: message.context,
  });
}
