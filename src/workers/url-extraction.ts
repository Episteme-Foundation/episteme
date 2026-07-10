import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { sources, claims, claimInstances } from "../db/schema.js";
import { extractClaims } from "../llm/agents/extractor.js";
import { matchClaim } from "../llm/agents/matcher.js";
import { generateEmbedding } from "../services/embedding-service.js";
import { updateJob } from "../services/job-service.js";
import { enqueueClaimPipeline, enqueueCurator } from "../services/queue-service.js";
import type { UrlExtractionMessage } from "../services/queue-service.js";
import { loadConfig } from "../config.js";

/**
 * Handle a URL extraction message:
 * 1. Fetch/retrieve the source content
 * 2. Extract claims using the Extractor agent
 * 3. For each claim: match against existing claims or create new
 * 4. Create claim instances linking claims to source
 * 5. Enqueue new claims for the claim pipeline
 */
export async function handleUrlExtraction(
  message: UrlExtractionMessage
): Promise<void> {
  const db = getDb();

  try {
    await updateJob(message.jobId, { status: "processing" });

    // Get the source
    const [source] = await db
      .select()
      .from(sources)
      .where(eq(sources.id, message.sourceId))
      .limit(1);

    if (!source) {
      await updateJob(message.jobId, {
        status: "failed",
        error: `Source not found: ${message.sourceId}`,
      });
      return;
    }

    // Fetch content if not already available
    let content = source.rawContent;
    if (!content) {
      content = await fetchUrlContent(message.url);
      await db
        .update(sources)
        .set({ rawContent: content })
        .where(eq(sources.id, source.id));
    }

    // Extract claims
    const extracted = await extractClaims({
      content,
      sourceType: source.sourceType,
      additionalContext: source.title,
      maxClaims: loadConfig().extractionMaxClaims,
    });

    let claimsCreated = 0;
    let claimsMatched = 0;

    for (const claim of extracted) {
      // The agentic Matcher is the single decider of claim identity: it does
      // its own (multi-framing, ungated) search, so we no longer pre-fetch
      // candidates here (#25).
      const matchResult = await matchClaim({
        extractedText: claim.original_text,
        proposedCanonical: claim.proposed_canonical_form,
      });

      let claimId: string;

      if (matchResult.is_match && matchResult.matched_claim_id) {
        // Link to existing claim
        claimId = matchResult.matched_claim_id;
        claimsMatched++;
      } else {
        // Create new claim. Embed the final canonical form (which the matcher
        // may have reworded) so the stored vector matches the stored text.
        const canonicalText =
          matchResult.new_canonical_form ?? claim.proposed_canonical_form;
        let embedding: number[] | undefined;
        try {
          embedding = await generateEmbedding(canonicalText);
        } catch {
          // Continue without embedding
        }

        // The extractor's importance is a provisional prior (salience in the
        // document + reach in the discourse); it seeds the Steward work-queue
        // ordering and the Steward overrides it with a considered, dependency-
        // aware judgment (#67).
        const importance = clampImportance(claim.importance);

        const [newClaim] = await db
          .insert(claims)
          .values({
            text: canonicalText,
            claimType: claim.claim_type,
            ...(importance !== undefined ? { importance } : {}),
            embedding,
            createdBy: "extractor",
          })
          .returning();

        claimId = newClaim!.id;
        claimsCreated++;

        // Onboard the new claim (the Steward will structure + assess it)
        await enqueueClaimPipeline({
          claimId,
          jobId: message.jobId,
        });

        // Proactively sweep the new claim's neighborhood with the Curator, to
        // catch duplicates/counterparts the Matcher missed and propose cross-claim
        // edges (#55). Only for *newly created* top-level claims (matched ones are
        // already placed); sampled by curatorSweepRate and bounded by curatorMaxRuns.
        const { curatorSweepRate } = loadConfig();
        if (curatorSweepRate > 0 && Math.random() < curatorSweepRate) {
          await enqueueCurator({
            trigger: "neighborhood_sweep",
            claimId,
            context:
              "A new claim was just ingested. Sweep its neighborhood for duplicates " +
              "or counterparts the Matcher may have missed, and for related claims " +
              "that should be linked.",
          });
        }
      }

      // Create instance linking claim to source. stance records whether this
      // source asserts the canonical claim or its negation, so a claim merged
      // with its counterpart still shows which side each source takes.
      await db.insert(claimInstances).values({
        claimId,
        sourceId: source.id,
        originalText: claim.original_text,
        context: claim.context,
        stance: matchResult.instance_stance ?? "affirms",
        confidence: claim.confidence,
      });
    }

    await updateJob(message.jobId, {
      status: "completed",
      result: {
        claims_extracted: extracted.length,
        claims_created: claimsCreated,
        claims_matched: claimsMatched,
      },
    });
  } catch (err) {
    await updateJob(message.jobId, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Coerce the extractor's importance to [0, 1], or undefined (→ DB default) if absent/invalid. */
function clampImportance(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(1, Math.max(0, n));
}

async function fetchUrlContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Episteme/1.0 (Knowledge Graph Indexer)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}
