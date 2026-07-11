import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export class SecretsStack extends cdk.Stack {
  public readonly openaiApiKeySecret: secretsmanager.Secret;
  public readonly anthropicApiKeySecret: secretsmanager.Secret;
  public readonly apiKeysSecret: secretsmanager.Secret;

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

    // Operator API keys for the Episteme API itself (#70): comma-separated
    // "key" or "key:contributor_external_id" entries. These are the service-
    // trusted keys (e.g. the web frontend's BFF key, which must match
    // EPISTEME_API_KEY in Vercel) — end-user keys are DB-backed and minted
    // from the dashboard. The API fails closed in production without this.
    this.apiKeysSecret = new secretsmanager.Secret(this, "ApiKeysSecret", {
      secretName: "episteme/api-keys",
      description:
        "Comma-separated operator keys for the Episteme API (API_KEYS env). " +
        "Must be manually populated after deploy.",
    });
  }
}
