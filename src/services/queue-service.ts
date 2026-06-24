import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { loadConfig } from "../config.js";

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
    | "curator_change";
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

// In-memory queue for local development
const localQueues = {
  claimPipeline: [] as ClaimPipelineMessage[],
  urlExtraction: [] as UrlExtractionMessage[],
  contribution: [] as ContributionMessage[],
  arbitration: [] as ArbitrationMessage[],
  steward: [] as StewardMessage[],
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

export async function enqueueSteward(
  message: StewardMessage
): Promise<void> {
  const config = loadConfig();
  if (!config.sqsStewardQueue) {
    localQueues.steward.push(message);
    return;
  }
  const client = getSqsClient();
  await client.send(
    new SendMessageCommand({
      QueueUrl: config.sqsStewardQueue,
      MessageBody: JSON.stringify(message),
    })
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
