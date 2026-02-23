import * as cdk from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export class QueueStack extends cdk.Stack {
  public readonly urlExtractionQueue: sqs.Queue;
  public readonly claimPipelineQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const urlExtractionDlq = new sqs.Queue(this, "UrlExtractionDlq", {
      queueName: "episteme-url-extraction-dlq",
      retentionPeriod: cdk.Duration.days(14),
    });

    this.urlExtractionQueue = new sqs.Queue(this, "UrlExtractionQueue", {
      queueName: "episteme-url-extraction",
      visibilityTimeout: cdk.Duration.seconds(120),
      deadLetterQueue: {
        queue: urlExtractionDlq,
        maxReceiveCount: 3,
      },
    });

    const claimPipelineDlq = new sqs.Queue(this, "ClaimPipelineDlq", {
      queueName: "episteme-claim-pipeline-dlq",
      retentionPeriod: cdk.Duration.days(14),
    });

    this.claimPipelineQueue = new sqs.Queue(this, "ClaimPipelineQueue", {
      queueName: "episteme-claim-pipeline",
      visibilityTimeout: cdk.Duration.seconds(120),
      deadLetterQueue: {
        queue: claimPipelineDlq,
        maxReceiveCount: 3,
      },
    });
  }
}
