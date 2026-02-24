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
  ancestorIds: string[];
  currentDepth: number;
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
  trigger: "subclaim_change" | "contribution_accepted" | "staleness_check";
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

// In-memory queue for local development
const localQueues = {
  claimPipeline: [] as ClaimPipelineMessage[],
  urlExtraction: [] as UrlExtractionMessage[],
  contribution: [] as ContributionMessage[],
  arbitration: [] as ArbitrationMessage[],
  steward: [] as StewardMessage[],
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
