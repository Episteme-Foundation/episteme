import { z } from "zod";

const DEFAULT_DB_URL =
  "postgresql://episteme:episteme_dev@localhost:5432/episteme";

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

  // AWS Bedrock
  awsRegion: z.string().default("us-east-1"),

  // SQS queues
  sqsUrlExtractionQueue: z.string().default(""),
  sqsClaimPipelineQueue: z.string().default(""),

  // Processing
  maxDecompositionDepth: z.coerce.number().default(5),
  matchingSimilarityThreshold: z.coerce.number().default(0.85),
  matchingTopK: z.coerce.number().default(20),

  // Governance
  governanceModel: z.string().default("us.anthropic.claude-sonnet-4-20250514"),
  arbitrationModel: z.string().default("us.anthropic.claude-sonnet-4-20250514"),
  secondOpinionModel: z.string().default("us.anthropic.claude-haiku-4-5-20251001"),
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
    awsRegion: process.env.AWS_REGION,
    sqsUrlExtractionQueue: process.env.SQS_URL_EXTRACTION_QUEUE,
    sqsClaimPipelineQueue: process.env.SQS_CLAIM_PIPELINE_QUEUE,
    maxDecompositionDepth: process.env.MAX_DECOMPOSITION_DEPTH,
    matchingSimilarityThreshold: process.env.MATCHING_SIMILARITY_THRESHOLD,
    matchingTopK: process.env.MATCHING_TOP_K,
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
