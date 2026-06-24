import { z } from "zod";
import { MODELS, isAnthropicModelId } from "./llm/models.js";

const DEFAULT_DB_URL =
  "postgresql://episteme:episteme_dev@localhost:5432/episteme";

// A model-ID field: defaults to an Anthropic API ID and rejects Bedrock-style
// "us.anthropic.*" overrides, which 404 against the Anthropic API (issue #11).
const modelId = (defaultId: string) =>
  z
    .string()
    .refine(isAnthropicModelId, {
      message:
        'must be an Anthropic API model ID like "claude-sonnet-4-6", not a ' +
        'Bedrock "us.anthropic.*" ID',
    })
    .default(defaultId);

const configSchema = z.object({
  env: z
    .enum(["development", "staging", "production"])
    .default("development"),
  port: z.coerce.number().default(3000),
  host: z.string().default("0.0.0.0"),
  logLevel: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // Database — either a full URL or individual fields (for ECS Secrets Manager)
  databaseUrl: z.string(),
  dbHost: z.string().optional(),
  dbPort: z.coerce.number().optional(),
  dbUser: z.string().optional(),
  dbName: z.string().optional(),
  dbPassword: z.string().optional(),

  // API auth
  apiKeys: z
    .string()
    .transform((s) => s.split(",").map((k) => k.trim()))
    .default(""),

  // CORS
  corsOrigins: z.string().default(""),

  // OpenAI embeddings
  openaiApiKey: z.string().default(""),

  // Anthropic API
  anthropicApiKey: z.string().default(""),
  awsRegion: z.string().default("us-east-1"),

  // Budget limits (0 = unlimited)
  llmHourlyCallLimit: z.coerce.number().default(0),
  llmDailyCallLimit: z.coerce.number().default(0),
  llmHourlyTokenLimit: z.coerce.number().default(0),
  llmDailyTokenLimit: z.coerce.number().default(0),

  // SQS queues
  sqsUrlExtractionQueue: z.string().default(""),
  sqsClaimPipelineQueue: z.string().default(""),

  // Processing
  matchingTopK: z.coerce.number().default(20),
  // Quantity caps to bound graph fan-out (0 = unlimited). The dominant cost
  // driver is extraction count, since each extracted claim seeds a tree.
  extractionMaxClaims: z.coerce.number().default(0),

  // The Steward owns decomposition + assessment in one tool-use loop, so its
  // iteration cap is a pure runaway backstop, NOT a work budget — set it high.
  // The real spend guardrail is the global LLM budget tracker plus stewardMaxRuns.
  stewardMaxIterations: z.coerce.number().default(200),
  // Cap the total number of Steward invocations per process (0 = unlimited).
  // This is how we bound spend predictably for tests/deploys — far better than a
  // decomposition-depth limit. Unprocessed claims remain embedded stubs, so dedup
  // still works and the claim count can converge; importance-prioritized
  // processing is a follow-up.
  stewardMaxRuns: z.coerce.number().default(0),

  // Governance — Anthropic API model IDs (see src/llm/models.ts).
  // The Matcher is an agentic search loop; a small model suffices since the
  // judgment is "same proposition?" over candidates it retrieves itself.
  matcherModel: modelId(MODELS.haiku),
  governanceModel: modelId(MODELS.sonnet),
  arbitrationModel: modelId(MODELS.sonnet),
  secondOpinionModel: modelId(MODELS.haiku),
  enableContributions: z
    .string()
    .transform((s) => s === "true")
    .default("false"),
  enableMultiModelConsensus: z
    .string()
    .transform((s) => s === "true")
    .default("false"),
  escalationConfidenceThreshold: z.coerce.number().default(0.6),
  auditSampleRate: z.coerce.number().default(0.05),

  // SQS governance queues
  sqsContributionQueue: z.string().default(""),
  sqsArbitrationQueue: z.string().default(""),
  sqsStewardQueue: z.string().default(""),
  sqsAuditQueue: z.string().default(""),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;

  const rawDatabaseUrl = process.env.DATABASE_URL ?? DEFAULT_DB_URL;

  _config = configSchema.parse({
    env: process.env.ENVIRONMENT,
    port: process.env.PORT,
    host: process.env.HOST,
    logLevel: process.env.LOG_LEVEL,
    databaseUrl: rawDatabaseUrl,
    dbHost: process.env.DB_HOST,
    dbPort: process.env.DB_PORT,
    dbUser: process.env.DB_USERNAME,
    dbName: process.env.DB_NAME,
    dbPassword: process.env.DB_PASSWORD,
    apiKeys: process.env.API_KEYS,
    corsOrigins: process.env.CORS_ORIGINS,
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    awsRegion: process.env.AWS_REGION,
    llmHourlyCallLimit: process.env.LLM_HOURLY_CALL_LIMIT,
    llmDailyCallLimit: process.env.LLM_DAILY_CALL_LIMIT,
    llmHourlyTokenLimit: process.env.LLM_HOURLY_TOKEN_LIMIT,
    llmDailyTokenLimit: process.env.LLM_DAILY_TOKEN_LIMIT,
    sqsUrlExtractionQueue: process.env.SQS_URL_EXTRACTION_QUEUE,
    sqsClaimPipelineQueue: process.env.SQS_CLAIM_PIPELINE_QUEUE,
    matchingTopK: process.env.MATCHING_TOP_K,
    extractionMaxClaims: process.env.EXTRACTION_MAX_CLAIMS,
    stewardMaxIterations: process.env.STEWARD_MAX_ITERATIONS,
    stewardMaxRuns: process.env.STEWARD_MAX_RUNS,
    matcherModel: process.env.MATCHER_MODEL,
    governanceModel: process.env.GOVERNANCE_MODEL,
    arbitrationModel: process.env.ARBITRATION_MODEL,
    secondOpinionModel: process.env.SECOND_OPINION_MODEL,
    enableContributions: process.env.ENABLE_CONTRIBUTIONS,
    enableMultiModelConsensus: process.env.ENABLE_MULTI_MODEL_CONSENSUS,
    escalationConfidenceThreshold: process.env.ESCALATION_CONFIDENCE_THRESHOLD,
    auditSampleRate: process.env.AUDIT_SAMPLE_RATE,
    sqsContributionQueue: process.env.SQS_CONTRIBUTION_QUEUE,
    sqsArbitrationQueue: process.env.SQS_ARBITRATION_QUEUE,
    sqsStewardQueue: process.env.SQS_STEWARD_QUEUE,
    sqsAuditQueue: process.env.SQS_AUDIT_QUEUE,
  });

  // If DATABASE_URL is the default and individual DB fields are set, construct URL
  if (_config.databaseUrl === DEFAULT_DB_URL && _config.dbHost) {
    const user = _config.dbUser ?? "episteme";
    const password = _config.dbPassword ?? "";
    const host = _config.dbHost;
    const port = _config.dbPort ?? 5432;
    const name = _config.dbName ?? "episteme";
    _config = {
      ..._config,
      databaseUrl: `postgresql://${user}:${password}@${host}:${port}/${name}`,
    };
  }

  return _config;
}
