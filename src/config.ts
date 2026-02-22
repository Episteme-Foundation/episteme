import { z } from "zod";

const configSchema = z.object({
  env: z
    .enum(["development", "staging", "production"])
    .default("development"),
  port: z.coerce.number().default(3000),
  host: z.string().default("0.0.0.0"),
  logLevel: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // Database
  databaseUrl: z.string(),

  // API auth
  apiKeys: z
    .string()
    .transform((s) => s.split(",").map((k) => k.trim()))
    .default(""),

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

  _config = configSchema.parse({
    env: process.env.ENVIRONMENT,
    port: process.env.PORT,
    host: process.env.HOST,
    logLevel: process.env.LOG_LEVEL,
    databaseUrl:
      process.env.DATABASE_URL ??
      "postgresql://episteme:episteme_dev@localhost:5432/episteme",
    apiKeys: process.env.API_KEYS,
    openaiApiKey: process.env.OPENAI_API_KEY,
    awsRegion: process.env.AWS_REGION,
    sqsUrlExtractionQueue: process.env.SQS_URL_EXTRACTION_QUEUE,
    sqsClaimPipelineQueue: process.env.SQS_CLAIM_PIPELINE_QUEUE,
    maxDecompositionDepth: process.env.MAX_DECOMPOSITION_DEPTH,
    matchingSimilarityThreshold: process.env.MATCHING_SIMILARITY_THRESHOLD,
    matchingTopK: process.env.MATCHING_TOP_K,
  });

  return _config;
}
