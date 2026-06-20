/**
 * Direct in-process pipeline driver.
 *
 * Locally there is no SQS and nothing drains the in-memory queues, so we call
 * the worker handlers directly and drain the claim-pipeline work-list ourselves.
 * handleClaimPipeline pushes follow-up messages onto the same in-memory queue as
 * it decomposes, so shifting until empty walks the whole decomposition tree.
 */
import { getLocalQueue } from "../../src/services/queue-service.js";
import { handleClaimPipeline } from "../../src/workers/claim-pipeline.js";

export interface DrainProgress {
  processed: number;
  remaining: number;
}

/**
 * Process every queued claim-pipeline message (decomposition + assessment) until
 * the in-memory queue is empty. Returns the number of messages processed.
 */
export async function drainClaimPipeline(
  onStep?: (p: DrainProgress) => void
): Promise<number> {
  const queue = getLocalQueue("claimPipeline");
  let processed = 0;
  while (queue.length > 0) {
    const message = queue.shift()!;
    await handleClaimPipeline(message);
    processed++;
    onStep?.({ processed, remaining: queue.length });
  }
  return processed;
}
