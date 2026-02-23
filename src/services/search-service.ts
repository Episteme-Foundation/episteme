import { rawQuery } from "../db/client.js";
import { generateEmbedding } from "./embedding-service.js";

export interface SearchResult {
  id: string;
  text: string;
  claim_type: string;
  state: string;
  similarity_score: number;
  assessment_status: string | null;
  assessment_confidence: number | null;
}

/**
 * Hybrid search combining keyword (tsvector + pg_trgm) and semantic (pgvector) scores.
 * Falls back to keyword-only if no embedding is available.
 */
export async function hybridSearch(
  query: string,
  options: { limit?: number; minSimilarity?: number } = {}
): Promise<{ results: SearchResult[]; total: number }> {
  const { limit = 20, minSimilarity = 0.3 } = options;

  let embedding: number[] | null = null;
  try {
    embedding = await generateEmbedding(query);
  } catch {
    // Fall back to keyword-only search if embedding fails
  }

  if (embedding) {
    return hybridSearchWithEmbedding(query, embedding, limit, minSimilarity);
  }
  return keywordSearch(query, limit);
}

async function hybridSearchWithEmbedding(
  query: string,
  embedding: number[],
  limit: number,
  minSimilarity: number
): Promise<{ results: SearchResult[]; total: number }> {
  const embeddingStr = `[${embedding.join(",")}]`;

  const rows = await rawQuery<
    SearchResult & { text_rank: number; semantic_score: number }
  >(
    `
    SELECT c.id, c.text, c.claim_type, c.state,
      ts_rank(c.text_search, websearch_to_tsquery('english', $1)) AS text_rank,
      1 - (c.embedding <=> $2::vector) AS semantic_score,
      a.status AS assessment_status, a.confidence AS assessment_confidence
    FROM claims c
    LEFT JOIN assessments a ON a.claim_id = c.id AND a.is_current = true
    WHERE c.state != 'deprecated'
      AND (c.text_search @@ websearch_to_tsquery('english', $1)
           OR 1 - (c.embedding <=> $2::vector) > $3)
    ORDER BY (0.4 * ts_rank(c.text_search, websearch_to_tsquery('english', $1))
            + 0.6 * (1 - (c.embedding <=> $2::vector))) DESC
    LIMIT $4
    `,
    [query, embeddingStr, minSimilarity, limit]
  );

  const results = rows.map((r) => ({
    id: r.id,
    text: r.text,
    claim_type: r.claim_type,
    state: r.state,
    similarity_score: 0.4 * (r.text_rank ?? 0) + 0.6 * (r.semantic_score ?? 0),
    assessment_status: r.assessment_status,
    assessment_confidence: r.assessment_confidence,
  }));

  return { results, total: results.length };
}

async function keywordSearch(
  query: string,
  limit: number
): Promise<{ results: SearchResult[]; total: number }> {
  const rows = await rawQuery<SearchResult & { text_rank: number }>(
    `
    SELECT c.id, c.text, c.claim_type, c.state,
      ts_rank(c.text_search, websearch_to_tsquery('english', $1)) AS text_rank,
      a.status AS assessment_status, a.confidence AS assessment_confidence
    FROM claims c
    LEFT JOIN assessments a ON a.claim_id = c.id AND a.is_current = true
    WHERE c.state != 'deprecated'
      AND c.text_search @@ websearch_to_tsquery('english', $1)
    ORDER BY text_rank DESC
    LIMIT $2
    `,
    [query, limit]
  );

  const results = rows.map((r) => ({
    id: r.id,
    text: r.text,
    claim_type: r.claim_type,
    state: r.state,
    similarity_score: r.text_rank ?? 0,
    assessment_status: r.assessment_status,
    assessment_confidence: r.assessment_confidence,
  }));

  return { results, total: results.length };
}

/**
 * Find semantically similar claims using pgvector cosine similarity.
 */
export async function findSimilarClaims(
  embedding: number[],
  options: { limit?: number; minSimilarity?: number; excludeId?: string } = {}
): Promise<SearchResult[]> {
  const { limit = 20, minSimilarity = 0.85, excludeId } = options;
  const embeddingStr = `[${embedding.join(",")}]`;

  const params: unknown[] = [embeddingStr, minSimilarity, limit];
  let excludeClause = "";
  if (excludeId) {
    excludeClause = "AND c.id != $4";
    params.push(excludeId);
  }

  const rows = await rawQuery<SearchResult & { semantic_score: number }>(
    `
    SELECT c.id, c.text, c.claim_type, c.state,
      1 - (c.embedding <=> $1::vector) AS semantic_score,
      a.status AS assessment_status, a.confidence AS assessment_confidence
    FROM claims c
    LEFT JOIN assessments a ON a.claim_id = c.id AND a.is_current = true
    WHERE c.state != 'deprecated'
      AND 1 - (c.embedding <=> $1::vector) > $2
      ${excludeClause}
    ORDER BY semantic_score DESC
    LIMIT $3
    `,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    claim_type: r.claim_type,
    state: r.state,
    similarity_score: r.semantic_score,
    assessment_status: r.assessment_status,
    assessment_confidence: r.assessment_confidence,
  }));
}
