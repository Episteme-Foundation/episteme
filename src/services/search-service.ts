import { rawQuery } from "../db/client.js";
import { generateEmbedding } from "./embedding-service.js";

export interface SearchResult {
  id: string;
  text: string;
  claim_type: string;
  state: string;
  similarity_score: number;
  importance: number;
  assessment_status: string | null;
  assessment_confidence: number | null;
}

// Filter on whether a claim carries a current assessment. "unassessed" matches
// the rule the UI badges use: a NULL current status (no row, or a mid-pipeline
// row whose status hasn't landed yet) reads as unassessed, not as a verdict.
export type AssessedFilter = "all" | "assessed" | "unassessed";

export interface SearchFilters {
  assessed?: AssessedFilter;
  minImportance?: number;
}

// Build the extra WHERE clauses for the assessment/importance filters, appending
// any bound params to `params` and referencing them by position. The assessment
// predicate keys off `a.status` (NULL ⇒ unassessed) so it agrees with the badges.
function filterClauses(filters: SearchFilters, params: unknown[]): string {
  let sql = "";
  if (filters.assessed === "assessed") sql += "\n      AND a.status IS NOT NULL";
  else if (filters.assessed === "unassessed") sql += "\n      AND a.status IS NULL";
  if (filters.minImportance && filters.minImportance > 0) {
    params.push(filters.minImportance);
    sql += `\n      AND c.importance >= $${params.length}`;
  }
  return sql;
}

/**
 * Hybrid search: keyword (tsvector) OR semantic (pgvector) matching for recall,
 * ranked by cosine similarity to the query embedding, keyword rank as tiebreak.
 * `similarity_score` is the cosine similarity (0 for claims with no embedding).
 * Falls back to keyword-only if no embedding is available.
 */
export async function hybridSearch(
  query: string,
  options: { limit?: number; minSimilarity?: number } & SearchFilters = {}
): Promise<{ results: SearchResult[]; total: number }> {
  const { limit = 20, minSimilarity = 0.3, assessed = "all", minImportance = 0 } = options;
  const filters: SearchFilters = { assessed, minImportance };

  let embedding: number[] | null = null;
  try {
    embedding = await generateEmbedding(query);
  } catch (err) {
    // Fall back to keyword-only search if embedding fails. Loudly: the
    // fallback has no proximity ordering, so a quiet failure here looks
    // like "search is broken" rather than "embeddings are down" (#43).
    console.warn(
      `Search embedding failed; falling back to keyword-only ranking: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (embedding) {
    return hybridSearchWithEmbedding(query, embedding, limit, minSimilarity, filters);
  }
  return keywordSearch(query, limit, filters);
}

async function hybridSearchWithEmbedding(
  query: string,
  embedding: number[],
  limit: number,
  minSimilarity: number,
  filters: SearchFilters
): Promise<{ results: SearchResult[]; total: number }> {
  const embeddingStr = `[${embedding.join(",")}]`;

  const params: unknown[] = [query, embeddingStr, minSimilarity];
  const filterSql = filterClauses(filters, params);
  params.push(limit);
  const limitIdx = params.length;

  // Order by semantic proximity, not a keyword/semantic blend: ts_rank and
  // cosine similarity live on different scales, so blending scrambled the
  // proximity order (#43). Keyword matching still widens recall via the WHERE
  // clause; ts_rank only breaks ties. COALESCE pins claims with NULL
  // embeddings to score 0 so they sort after every scored row.
  const rows = await rawQuery<
    SearchResult & { text_rank: number; semantic_score: number }
  >(
    `
    SELECT c.id, c.text, c.claim_type, c.state, c.importance,
      ts_rank(c.text_search, websearch_to_tsquery('english', $1)) AS text_rank,
      1 - (c.embedding <=> $2::vector) AS semantic_score,
      a.status AS assessment_status, a.confidence AS assessment_confidence
    FROM claims c
    LEFT JOIN assessments a ON a.claim_id = c.id AND a.is_current = true
    WHERE c.state != 'deprecated' AND c.merged_into IS NULL
      AND (c.text_search @@ websearch_to_tsquery('english', $1)
           OR 1 - (c.embedding <=> $2::vector) > $3)${filterSql}
    ORDER BY COALESCE(1 - (c.embedding <=> $2::vector), 0) DESC,
      ts_rank(c.text_search, websearch_to_tsquery('english', $1)) DESC
    LIMIT $${limitIdx}
    `,
    params
  );

  const results = rows.map((r) => ({
    id: r.id,
    text: r.text,
    claim_type: r.claim_type,
    state: r.state,
    similarity_score: r.semantic_score ?? 0,
    importance: r.importance,
    assessment_status: r.assessment_status,
    assessment_confidence: r.assessment_confidence,
  }));

  return { results, total: results.length };
}

async function keywordSearch(
  query: string,
  limit: number,
  filters: SearchFilters
): Promise<{ results: SearchResult[]; total: number }> {
  const params: unknown[] = [query];
  const filterSql = filterClauses(filters, params);
  params.push(limit);
  const limitIdx = params.length;

  const rows = await rawQuery<SearchResult & { text_rank: number }>(
    `
    SELECT c.id, c.text, c.claim_type, c.state, c.importance,
      ts_rank(c.text_search, websearch_to_tsquery('english', $1)) AS text_rank,
      a.status AS assessment_status, a.confidence AS assessment_confidence
    FROM claims c
    LEFT JOIN assessments a ON a.claim_id = c.id AND a.is_current = true
    WHERE c.state != 'deprecated' AND c.merged_into IS NULL
      AND c.text_search @@ websearch_to_tsquery('english', $1)${filterSql}
    ORDER BY text_rank DESC
    LIMIT $${limitIdx}
    `,
    params
  );

  const results = rows.map((r) => ({
    id: r.id,
    text: r.text,
    claim_type: r.claim_type,
    state: r.state,
    similarity_score: r.text_rank ?? 0,
    importance: r.importance,
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
    SELECT c.id, c.text, c.claim_type, c.state, c.importance,
      1 - (c.embedding <=> $1::vector) AS semantic_score,
      a.status AS assessment_status, a.confidence AS assessment_confidence
    FROM claims c
    LEFT JOIN assessments a ON a.claim_id = c.id AND a.is_current = true
    WHERE c.state != 'deprecated' AND c.merged_into IS NULL
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
    importance: r.importance,
    assessment_status: r.assessment_status,
    assessment_confidence: r.assessment_confidence,
  }));
}
