import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { loadConfig } from "../config.js";
import { rawQuery } from "../db/client.js";

let _sqsClient: SQSClient | null = null;

function getSqsClient(): SQSClient {
  if (_sqsClient) return _sqsClient;
  const config = loadConfig();
  _sqsClient = new SQSClient({ region: config.awsRegion });
  return _sqsClient;
}

export interface ClaimPipelineMessage {
  claimId: string;
  jobId: string;
}

export interface UrlExtractionMessage {
  sourceId: string;
  jobId: string;
  url: string;
}

export interface ContributionMessage {
  contributionId: string;
}

export interface ArbitrationMessage {
  contributionId: string;
  trigger: "escalated_review" | "appeal" | "conflict_resolution";
  appealId?: string;
}

export interface StewardMessage {
  claimId: string;
  trigger:
    // First pass for a newly onboarded claim: STRUCTURE it (decompose, matching
    // each dependency) and ASSESS it.
    | "structure_and_assess"
    // Re-triggers: re-assess (and adjust structure only if a genuinely missing
    // dependency is found).
    | "subclaim_change"
    | "contribution_accepted"
    | "staleness_check"
    // The Curator merged/split this claim, or suggests a structural edge — review
    // and reconcile (re-assess; adopt the suggested edge if apt).
    | "curator_change"
    // One-shot backfill (issue #129): named arguments predating write_argument
    // lack a written form — write one for each.
    | "argument_written_form_backfill"
    // One-shot backfill (issue #173): named arguments predating
    // evaluate_argument lack an evaluation — evaluate each.
    | "argument_evaluation_backfill";
  context: string;
}

export interface AuditMessage {
  auditType:
    | "decision_audit"
    | "pattern_analysis"
    | "contributor_review"
    | "anomaly_investigation";
  context: string;
}

export interface CuratorMessage {
  trigger:
    // A Steward flagged something structural (likely duplicate, needs split, …).
    | "steward_escalation"
    // Look across a new claim's neighborhood for duplicates / missing edges.
    | "neighborhood_sweep";
  // The claim whose neighborhood to reconcile (the escalating/anchor claim).
  claimId: string;
  context: string;
}

// In-memory queue for local development.
// NOTE: the Steward is intentionally absent — it is no longer a message queue at
// all. A claim's `steward_state` column IS its queue (see enqueueSteward below),
// drained highest-importance-first by the DB-backed drain in steward-pipeline.ts.
// This is the single mechanism in both dev and prod (no SQS/in-memory drift).
const localQueues = {
  claimPipeline: [] as ClaimPipelineMessage[],
  urlExtraction: [] as UrlExtractionMessage[],
  contribution: [] as ContributionMessage[],
  arbitration: [] as ArbitrationMessage[],
  curator: [] as CuratorMessage[],
  audit: [] as AuditMessage[],
};

export function getLocalQueue<T extends keyof typeof localQueues>(
  name: T
): (typeof localQueues)[T] {
  return localQueues[name];
}

export async function enqueueClaimPipeline(
  message: ClaimPipelineMessage
): Promise<void> {
  const config = loadConfig();

  if (!config.sqsClaimPipelineQueue) {
    // Local dev: push to in-memory queue
    localQueues.claimPipeline.push(message);
    return;
  }

  const client = getSqsClient();
  await client.send(
    new SendMessageCommand({
      QueueUrl: config.sqsClaimPipelineQueue,
      MessageBody: JSON.stringify(message),
    })
  );
}

export async function enqueueUrlExtraction(
  message: UrlExtractionMessage
): Promise<void> {
  const config = loadConfig();

  if (!config.sqsUrlExtractionQueue) {
    // Local dev: push to in-memory queue
    localQueues.urlExtraction.push(message);
    return;
  }

  const client = getSqsClient();
  await client.send(
    new SendMessageCommand({
      QueueUrl: config.sqsUrlExtractionQueue,
      MessageBody: JSON.stringify(message),
    })
  );
}

export async function enqueueContribution(
  message: ContributionMessage
): Promise<void> {
  const config = loadConfig();
  if (!config.sqsContributionQueue) {
    localQueues.contribution.push(message);
    return;
  }
  const client = getSqsClient();
  await client.send(
    new SendMessageCommand({
      QueueUrl: config.sqsContributionQueue,
      MessageBody: JSON.stringify(message),
    })
  );
}

export async function enqueueArbitration(
  message: ArbitrationMessage
): Promise<void> {
  const config = loadConfig();
  if (!config.sqsArbitrationQueue) {
    localQueues.arbitration.push(message);
    return;
  }
  const client = getSqsClient();
  await client.send(
    new SendMessageCommand({
      QueueUrl: config.sqsArbitrationQueue,
      MessageBody: JSON.stringify(message),
    })
  );
}

/**
 * "Enqueue" a Steward run by marking the claim pending in the DB — the claim row
 * IS the work queue. Idempotent: re-triggers coalesce into the single pending
 * slot (latest trigger/context wins), which tames the propagation storm where
 * one assessment notifies many dependents. Ordering is by the persisted
 * `claims.importance` column, so the message carries no importance of its own.
 * Works identically in dev and prod — there is no SQS path for the Steward.
 */
export async function enqueueSteward(
  message: StewardMessage
): Promise<void> {
  await rawQuery(
    `UPDATE claims
        SET steward_state = 'pending',
            steward_trigger = $2,
            steward_context = $3,
            updated_at = now()
      WHERE id = $1
        AND state = 'active'`,
    [message.claimId, message.trigger, message.context]
  );
}

export async function enqueueCurator(
  message: CuratorMessage
): Promise<void> {
  const config = loadConfig();
  if (!config.sqsCuratorQueue) {
    localQueues.curator.push(message);
    return;
  }
  const client = getSqsClient();
  await client.send(
    new SendMessageCommand({
      QueueUrl: config.sqsCuratorQueue,
      MessageBody: JSON.stringify(message),
    })
  );
}

export async function enqueueAudit(
  message: AuditMessage
): Promise<void> {
  const config = loadConfig();
  if (!config.sqsAuditQueue) {
    localQueues.audit.push(message);
    return;
  }
  const client = getSqsClient();
  await client.send(
    new SendMessageCommand({
      QueueUrl: config.sqsAuditQueue,
      MessageBody: JSON.stringify(message),
    })
  );
}
