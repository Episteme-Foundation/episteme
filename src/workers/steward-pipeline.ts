/**
 * Steward pipeline worker.
 * Thin wrapper that invokes the Claim Steward agent.
 */
import type { StewardMessage } from "../services/queue-service.js";
import { runClaimSteward } from "../llm/agents/claim-steward.js";
import { loadConfig } from "../config.js";

/**
 * Total Steward invocations so far in this process. Capping this (via
 * `stewardMaxRuns`) is how we bound spend predictably for tests and deploys —
 * decomposition has no depth limit, so this run budget is the backstop. Once the
 * cap is hit, further claims are simply left as embedded stubs (still dedup-able,
 * so the graph can converge); importance-prioritized processing is a follow-up.
 */
let stewardRunCount = 0;

/** Test-only: reset the per-process Steward run counter. */
export function resetStewardRunCount(): void {
  stewardRunCount = 0;
}

export async function handleStewardMessage(
  message: StewardMessage
): Promise<void> {
  const { stewardMaxRuns } = loadConfig();
  if (stewardMaxRuns > 0 && stewardRunCount >= stewardMaxRuns) {
    return; // spend backstop reached — leave the claim as a stub
  }
  stewardRunCount++;

  await runClaimSteward({
    trigger: message.trigger,
    claimId: message.claimId,
    context: message.context,
  });
}
