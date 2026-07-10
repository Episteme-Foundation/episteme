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

  // API auth — comma-separated entries of "key" or "key:contributor_external_id".
  // Binding a key to a contributor lets contribution/appeal endpoints derive the
  // acting identity from the authenticated key instead of trusting a body field
  // (issue #10). Unbound keys still authenticate but cannot act as a contributor.
  apiKeys: z
    .string()
    .transform((s) => s.split(",").map((k) => k.trim().split(":")[0]!))
    .default(""),
  apiKeyContributors: z
    .string()
    .transform((s) => {
      const map: Record<string, string> = {};
      for (const entry of s.split(",")) {
        const sep = entry.indexOf(":");
        if (sep === -1) continue;
        const key = entry.slice(0, sep).trim();
        const contributor = entry.slice(sep + 1).trim();
        if (key && contributor) map[key] = contributor;
      }
      return map;
    })
    .default(""),

  // CORS
  corsOrigins: z.string().default(""),

  // OpenAI embeddings
  openaiApiKey: z.string().default(""),

  // Anthropic API
  anthropicApiKey: z.string().default(""),
  awsRegion: z.string().default("us-east-1"),

  // Accounts / metering (#70)
  // Monthly free-tier grant for METERED (agentic/LLM-backed) usage, in USD of
  // derived cost. Non-agentic reads are never metered. 0 disables the trial
  // (all agentic use requires credits, which aren't purchasable yet → 402).
  freeTierMonthlyUsd: z.coerce.number().default(5),
  // Per-key rate limit on agentic endpoints (requests/hour, 0 = unlimited).
  // A blunt in-memory backstop against runaway clients; the real spend
  // guardrail is the metered monthly grant above.
  agenticRateLimitPerHour: z.coerce.number().default(30),

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
  // Cap the total number of Curator invocations per process (0 = unlimited),
  // mirroring stewardMaxRuns for predictable test/deploy spend.
  curatorMaxRuns: z.coerce.number().default(0),
  // Probability (0..1) that a newly *created* top-level claim triggers a proactive
  // Curator neighborhood sweep. 0 disables the proactive path (escalation-only);
  // 1 sweeps every new claim. Still bounded by curatorMaxRuns + the LLM budget.
  curatorSweepRate: z.coerce.number().default(1),

  // Governance — Anthropic API model IDs (see src/llm/models.ts).
  // The Matcher is an agentic search loop; a small model suffices since the
  // judgment is "same proposition?" over candidates it retrieves itself.
  matcherModel: modelId(MODELS.haiku),
  // The Steward assesses AND decomposes the "main" claims — the load-bearing
  // epistemic work. Default Sonnet keeps tests cheap; production sets
  // STEWARD_MODEL=claude-opus-4-8 so the most important claims get Opus. The
  // importance-priority drain means Opus only ever runs on the top of the queue.
  stewardModel: modelId(MODELS.sonnet),
  // The Curator adjudicates merges/splits and proposes structure — recognizing
  // duplicates saturates, but a contested split is judgment, so production runs
  // it on Opus (CURATOR_MODEL).
  curatorModel: modelId(MODELS.sonnet),
  // Shared by the Contribution Reviewer. The Audit Agent has its own knob
  // (auditModel) so it can run on Opus without also upgrading the reviewer.
  governanceModel: modelId(MODELS.sonnet),
  auditModel: modelId(MODELS.sonnet),
  // Arbitration is the highest-stakes governance call; production sets
  // ARBITRATION_MODEL=claude-opus-4-8.
  arbitrationModel: modelId(MODELS.sonnet),
  enableContributions: z
    .string()
    .transform((s) => s === "true")
    .default("false"),
  escalationConfidenceThreshold: z.coerce.number().default(0.6),
  auditSampleRate: z.coerce.number().default(0.05),

  // SQS governance queues
  sqsContributionQueue: z.string().default(""),
  sqsArbitrationQueue: z.string().default(""),
  sqsStewardQueue: z.string().default(""),
  sqsCuratorQueue: z.string().default(""),
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
    apiKeyContributors: process.env.API_KEYS,
    corsOrigins: process.env.CORS_ORIGINS,
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    awsRegion: process.env.AWS_REGION,
    freeTierMonthlyUsd: process.env.FREE_TIER_MONTHLY_USD,
    agenticRateLimitPerHour: process.env.AGENTIC_RATE_LIMIT_PER_HOUR,
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
    curatorMaxRuns: process.env.CURATOR_MAX_RUNS,
    curatorSweepRate: process.env.CURATOR_SWEEP_RATE,
    matcherModel: process.env.MATCHER_MODEL,
    stewardModel: process.env.STEWARD_MODEL,
    curatorModel: process.env.CURATOR_MODEL,
    governanceModel: process.env.GOVERNANCE_MODEL,
    auditModel: process.env.AUDIT_MODEL,
    arbitrationModel: process.env.ARBITRATION_MODEL,
    enableContributions: process.env.ENABLE_CONTRIBUTIONS,
    escalationConfidenceThreshold: process.env.ESCALATION_CONFIDENCE_THRESHOLD,
    auditSampleRate: process.env.AUDIT_SAMPLE_RATE,
    sqsContributionQueue: process.env.SQS_CONTRIBUTION_QUEUE,
    sqsArbitrationQueue: process.env.SQS_ARBITRATION_QUEUE,
    sqsStewardQueue: process.env.SQS_STEWARD_QUEUE,
    sqsCuratorQueue: process.env.SQS_CURATOR_QUEUE,
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
