/**
 * Steward work queue — DB-backed, importance-prioritized drain.
 *
 * The Steward is NOT an SQS/in-memory message queue. A claim's `steward_state`
 * column IS its queue: `enqueueSteward` (queue-service) marks a claim 'pending',
 * and this drain repeatedly claims the highest-`importance` pending claim, runs
 * its Steward, and marks it 'done' (or 'error'). One mechanism in dev and prod.
 *
 * Why this shape:
 *  - Importance priority is native (`ORDER BY importance DESC`), so under a budget
 *    the most load-bearing claims are assessed and the rest stay embedded stubs —
 *    the expected steady state, since each assessed claim tends to mint >1 novel
 *    subclaim until claimspace densifies, so the queue is perpetually non-empty.
 *  - Spend is bounded by the LLM budget tracker (token/call limits), not by a
 *    per-process run counter that would permanently wedge a long-lived worker.
 *  - `FOR UPDATE SKIP LOCKED` makes it safe for several prod tasks to drain
 *    concurrently; a 'running' row stuck >15m (crashed worker) is reclaimable.
 */
import { rawQuery } from "../db/client.js";
import { runClaimSteward } from "../llm/agents/claim-steward.js";
import { loadConfig } from "../config.js";
import { checkBudget } from "../llm/budget-tracker.js";
import { LlmBudgetExceededError } from "../llm/errors.js";

interface StewardTaskRow {
  id: string;
  steward_trigger: string | null;
  steward_context: string | null;
}

export type StewardDrainStatus = "processed" | "empty" | "budget";

export interface StewardProcessResult {
  status: StewardDrainStatus;
  claimId?: string;
  trigger?: string;
  ok?: boolean;
  error?: string;
}

/**
 * Atomically claim the single highest-importance pending claim and steward it.
 * Returns 'empty' when nothing is pending and 'budget' when the LLM budget is
 * spent (the claim is left pending for the next window — not this claim's fault).
 */
export async function processNextStewardTask(
  opts: { model?: string } = {}
): Promise<StewardProcessResult> {
  const model = opts.model ?? loadConfig().stewardModel;

  // Don't even claim a task if we're already over budget this window.
  try {
    checkBudget();
  } catch {
    return { status: "budget" };
  }

  const rows = await rawQuery<StewardTaskRow>(
    `UPDATE claims
        SET steward_state = 'running', stewarded_at = now()
      WHERE id = (
        SELECT id FROM claims
         WHERE state = 'active'
           AND (steward_state = 'pending'
                OR (steward_state = 'running'
                    AND stewarded_at < now() - interval '15 minutes'))
         ORDER BY importance DESC, updated_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, steward_trigger, steward_context`
  );
  if (rows.length === 0) return { status: "empty" };

  const task = rows[0]!;
  const trigger = task.steward_trigger ?? "structure_and_assess";
  try {
    await runClaimSteward({
      trigger,
      claimId: task.id,
      context: task.steward_context ?? "",
      model,
    });
    await rawQuery(
      `UPDATE claims SET steward_state = 'done', steward_error = NULL WHERE id = $1`,
      [task.id]
    );
    return { status: "processed", claimId: task.id, trigger, ok: true };
  } catch (err) {
    if (err instanceof LlmBudgetExceededError) {
      // Budget, not a bad claim — return it to the queue for the next window.
      await rawQuery(`UPDATE claims SET steward_state = 'pending' WHERE id = $1`, [
        task.id,
      ]);
      return { status: "budget", claimId: task.id };
    }
    const msg = err instanceof Error ? err.message : String(err);
    // Park the poison claim as 'error' so the drain doesn't spin on it.
    await rawQuery(
      `UPDATE claims SET steward_state = 'error', steward_error = $2 WHERE id = $1`,
      [task.id, msg]
    );
    return { status: "processed", claimId: task.id, trigger, ok: false, error: msg };
  }
}

/**
 * Drain the queue until empty, budget-exhausted, or `maxTasks` processed.
 * `maxTasks` defaults to STEWARD_MAX_RUNS (0 = unlimited); the real governor in
 * production is the token budget, with maxTasks mainly a test/dev cost knob.
 */
export async function drainStewardQueue(
  opts: {
    maxTasks?: number;
    model?: string;
    onResult?: (r: StewardProcessResult) => void;
  } = {}
): Promise<{ processed: number; budgetHit: boolean }> {
  const { stewardMaxRuns } = loadConfig();
  const cap =
    opts.maxTasks ?? (stewardMaxRuns > 0 ? stewardMaxRuns : Number.POSITIVE_INFINITY);

  let processed = 0;
  while (processed < cap) {
    const r = await processNextStewardTask({ model: opts.model });
    opts.onResult?.(r);
    if (r.status === "empty") return { processed, budgetHit: false };
    if (r.status === "budget") return { processed, budgetHit: true };
    processed++;
  }
  return { processed, budgetHit: false };
}

/** How many claims are waiting to be stewarded (the live queue depth). */
export async function pendingStewardCount(): Promise<number> {
  const [row] = await rawQuery<{ n: number }>(
    `SELECT count(*)::int AS n FROM claims
      WHERE state = 'active' AND steward_state = 'pending'`
  );
  return row?.n ?? 0;
}
