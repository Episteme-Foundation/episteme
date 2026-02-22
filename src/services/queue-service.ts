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

// In-memory queue for local development
const localQueues = {
  claimPipeline: [] as ClaimPipelineMessage[],
  urlExtraction: [] as UrlExtractionMessage[],
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
