/**
 * Audit pipeline worker.
 * Thin wrapper that invokes the Audit Agent.
 */
import type { AuditMessage } from "../services/queue-service.js";
import { runAudit } from "../llm/agents/audit-agent.js";

export async function handleAuditMessage(
  message: AuditMessage
): Promise<void> {
  await runAudit({
    auditType: message.auditType,
    context: message.context,
  });
}
