/**
 * Curator pipeline worker.
 * Thin wrapper that invokes the Curator agent, with a per-process run cap so
 * curation spend is bounded predictably for tests/deploys (like the Steward).
 */
import type { CuratorMessage } from "../services/queue-service.js";
import { runCurator } from "../llm/agents/curator.js";
import { loadConfig } from "../config.js";

let curatorRunCount = 0;

/** Test-only: reset the per-process Curator run counter. */
export function resetCuratorRunCount(): void {
  curatorRunCount = 0;
}

export async function handleCuratorMessage(
  message: CuratorMessage
): Promise<void> {
  const { curatorMaxRuns } = loadConfig();
  if (curatorMaxRuns > 0 && curatorRunCount >= curatorMaxRuns) {
    return; // spend backstop reached
  }
  curatorRunCount++;

  await runCurator({
    trigger: message.trigger,
    claimId: message.claimId,
    context: message.context,
  });
}
