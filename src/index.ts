import "dotenv/config";
import { buildApp } from "./server/app.js";
import { loadConfig } from "./config.js";
import { closeDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { startPoller } from "./workers/poller.js";
import { handleClaimPipeline } from "./workers/claim-pipeline.js";
import { handleUrlExtraction } from "./workers/url-extraction.js";
import { handleContributionMessage } from "./workers/contribution-pipeline.js";
import { handleArbitrationMessage } from "./workers/arbitration-pipeline.js";
import { handleStewardMessage } from "./workers/steward-pipeline.js";
import { handleAuditMessage } from "./workers/audit-pipeline.js";
import type {
  ClaimPipelineMessage,
  UrlExtractionMessage,
  ContributionMessage,
  ArbitrationMessage,
  StewardMessage,
  AuditMessage,
} from "./services/queue-service.js";

async function main() {
  const config = loadConfig();

  // Run migrations at startup in production
  if (config.env === "production") {
    console.log("Running database migrations...");
    await runMigrations(config.databaseUrl);
    console.log("Migrations complete.");
  }

  const app = await buildApp();
  const pollers: Array<{ stop: () => void }> = [];

  // Start queue pollers for configured queues
  const logger = {
    info: (...args: unknown[]) => app.log.info(args),
    error: (...args: unknown[]) => app.log.error(args),
  };

  if (config.sqsClaimPipelineQueue) {
    pollers.push(startPoller<ClaimPipelineMessage>({
      queueUrl: config.sqsClaimPipelineQueue,
      handler: handleClaimPipeline,
      logger,
    }));
  }

  if (config.sqsUrlExtractionQueue) {
    pollers.push(startPoller<UrlExtractionMessage>({
      queueUrl: config.sqsUrlExtractionQueue,
      handler: handleUrlExtraction,
      logger,
    }));
  }

  if (config.sqsContributionQueue) {
    pollers.push(startPoller<ContributionMessage>({
      queueUrl: config.sqsContributionQueue,
      handler: handleContributionMessage,
      logger,
    }));
  }

  if (config.sqsArbitrationQueue) {
    pollers.push(startPoller<ArbitrationMessage>({
      queueUrl: config.sqsArbitrationQueue,
      handler: handleArbitrationMessage,
      logger,
    }));
  }

  if (config.sqsStewardQueue) {
    pollers.push(startPoller<StewardMessage>({
      queueUrl: config.sqsStewardQueue,
      handler: handleStewardMessage,
      logger,
    }));
  }

  if (config.sqsAuditQueue) {
    pollers.push(startPoller<AuditMessage>({
      queueUrl: config.sqsAuditQueue,
      handler: handleAuditMessage,
      logger,
    }));
  }

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info("Shutting down...");
    for (const poller of pollers) poller.stop();
    await app.close();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
