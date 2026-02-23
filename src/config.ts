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
