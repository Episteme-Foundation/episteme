/**
 * Audit pipeline worker.
 * Invokes the Audit Agent, then closes out the run row (#180): completion
 * time and findings count, so the audit subsystem's activity is observable
 * from the database alone.
 */
import type { AuditMessage } from "../services/queue-service.js";
import { rawQuery } from "../db/client.js";
import { runAudit } from "../llm/agents/audit-agent.js";

export async function handleAuditMessage(
  message: AuditMessage
): Promise<void> {
  await runAudit({
    auditType: message.auditType,
    context: message.context,
    runId: message.runId,
  });

  if (message.runId) {
    await rawQuery(
      `UPDATE audit_runs
       SET completed_at = now(),
           findings_count = (SELECT count(*) FROM audit_findings WHERE run_id = $1)
       WHERE id = $1`,
      [message.runId]
    );
  }
}
