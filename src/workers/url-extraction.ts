import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { sources, claims, claimInstances } from "../db/schema.js";
import { extractClaims } from "../llm/agents/extractor.js";
import { matchClaim } from "../llm/agents/matcher.js";
import { generateEmbedding } from "../services/embedding-service.js";
import { findSimilarClaims } from "../services/search-service.js";
import { updateJob } from "../services/job-service.js";
import { enqueueClaimPipeline } from "../services/queue-service.js";
import type { UrlExtractionMessage } from "../services/queue-service.js";

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
    });

    let claimsCreated = 0;
    let claimsMatched = 0;

    for (const claim of extracted) {
      // Generate embedding for the canonical form
      const embedding = await generateEmbedding(
        claim.proposed_canonical_form
      );

      // Find similar existing claims
      const similar = await findSimilarClaims(embedding, {
        limit: 10,
        minSimilarity: 0.8,
      });

      // Match against candidates
      const matchResult = await matchClaim({
        extractedText: claim.original_text,
        proposedCanonical: claim.proposed_canonical_form,
        candidates: similar.map((s) => ({
          id: s.id,
          canonical_form: s.text,
          score: s.similarity_score,
        })),
      });

      let claimId: string;

      if (matchResult.is_match && matchResult.matched_claim_id) {
        // Link to existing claim
        claimId = matchResult.matched_claim_id;
        claimsMatched++;
      } else {
        // Create new claim
        const [newClaim] = await db
          .insert(claims)
          .values({
            text:
              matchResult.new_canonical_form ??
              claim.proposed_canonical_form,
            claimType: claim.claim_type,
            embedding,
            createdBy: "extractor",
          })
          .returning();

        claimId = newClaim!.id;
        claimsCreated++;

        // Enqueue for decomposition
        await enqueueClaimPipeline({
          claimId,
          jobId: message.jobId,
          ancestorIds: [],
          currentDepth: 0,
        });
      }

      // Create instance linking claim to source
      await db.insert(claimInstances).values({
        claimId,
        sourceId: source.id,
        originalText: claim.original_text,
        context: claim.context,
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
