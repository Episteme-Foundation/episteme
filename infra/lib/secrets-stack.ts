import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export class SecretsStack extends cdk.Stack {
  public readonly openaiApiKeySecret: secretsmanager.Secret;
  public readonly anthropicApiKeySecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.openaiApiKeySecret = new secretsmanager.Secret(
      this,
      "OpenaiApiKeySecret",
      {
        secretName: "episteme/openai-api-key",
        description:
          "OpenAI API key for Episteme embeddings. Must be manually populated after deploy.",
      }
    );

    this.anthropicApiKeySecret = new secretsmanager.Secret(
      this,
      "AnthropicApiKeySecret",
      {
        secretName: "episteme/anthropic-api-key",
        description:
          "Anthropic API key for LLM inference. Must be manually populated after deploy.",
      }
    );
  }
}
