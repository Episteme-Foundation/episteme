import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../../../src/db/client.js", () => ({
  rawQuery: vi.fn(),
}));

vi.mock("../../../src/services/embedding-service.js", () => ({
  generateEmbedding: vi.fn(),
}));

vi.mock("../../../src/config.js", () => ({
  loadConfig: () => ({
    openaiApiKey: "test-key",
    databaseUrl: "postgresql://test",
  }),
}));

import { hybridSearch, findSimilarClaims } from "../../../src/services/search-service.js";
import { rawQuery } from "../../../src/db/client.js";
import { generateEmbedding } from "../../../src/services/embedding-service.js";

const mockRawQuery = vi.mocked(rawQuery);
const mockGenerateEmbedding = vi.mocked(generateEmbedding);

describe("search-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("hybridSearch", () => {
    it("uses hybrid search when embedding succeeds", async () => {
      const fakeEmbedding = new Array(1536).fill(0.1);
      mockGenerateEmbedding.mockResolvedValueOnce(fakeEmbedding);
      mockRawQuery.mockResolvedValueOnce([
        {
          id: "claim-1",
          text: "Test claim",
          claim_type: "empirical_derived",
          state: "active",
          text_rank: 0.5,
          semantic_score: 0.8,
          assessment_status: "verified",
          assessment_confidence: 0.9,
        },
      ]);

      const result = await hybridSearch("test query");
      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.id).toBe("claim-1");
      // Score = 0.4 * 0.5 + 0.6 * 0.8 = 0.68
      expect(result.results[0]!.similarity_score).toBeCloseTo(0.68, 2);
    });

    it("falls back to keyword search when embedding fails", async () => {
      mockGenerateEmbedding.mockRejectedValueOnce(new Error("API error"));
      mockRawQuery.mockResolvedValueOnce([
        {
          id: "claim-1",
          text: "Test claim",
          claim_type: "empirical_derived",
          state: "active",
          text_rank: 0.7,
          assessment_status: null,
          assessment_confidence: null,
        },
      ]);

      const result = await hybridSearch("test query");
      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.similarity_score).toBeCloseTo(0.7, 2);
    });
  });

  describe("filters", () => {
    const embedding = () => new Array(1536).fill(0.1);

    it("adds an unassessed predicate without shifting the LIMIT placeholder", async () => {
      mockGenerateEmbedding.mockResolvedValueOnce(embedding());
      mockRawQuery.mockResolvedValueOnce([]);
      await hybridSearch("q", { assessed: "unassessed" });
      const [sql, params] = mockRawQuery.mock.calls[0]!;
      expect(sql).toContain("a.status IS NULL");
      // query, embedding, minSimilarity, limit — the predicate binds no param.
      expect(params).toHaveLength(4);
      expect(sql).toContain("LIMIT $4");
    });

    it("adds an assessed predicate", async () => {
      mockGenerateEmbedding.mockResolvedValueOnce(embedding());
      mockRawQuery.mockResolvedValueOnce([]);
      await hybridSearch("q", { assessed: "assessed" });
      expect(mockRawQuery.mock.calls[0]![0]).toContain("a.status IS NOT NULL");
    });

    it("binds min_importance and shifts the LIMIT placeholder", async () => {
      mockGenerateEmbedding.mockResolvedValueOnce(embedding());
      mockRawQuery.mockResolvedValueOnce([]);
      await hybridSearch("q", { minImportance: 0.65 });
      const [sql, params] = mockRawQuery.mock.calls[0]!;
      expect(sql).toContain("c.importance >= $4");
      expect(sql).toContain("LIMIT $5");
      // query, embedding, minSimilarity, minImportance, limit
      expect(params).toHaveLength(5);
      expect(params![3]).toBe(0.65);
    });

    it("adds no filter clauses by default", async () => {
      mockGenerateEmbedding.mockResolvedValueOnce(embedding());
      mockRawQuery.mockResolvedValueOnce([]);
      await hybridSearch("q");
      const [sql, params] = mockRawQuery.mock.calls[0]!;
      expect(sql).not.toContain("a.status IS");
      expect(sql).not.toContain("c.importance >=");
      expect(params).toHaveLength(4);
    });

    it("applies filters on the keyword fallback with the right param indices", async () => {
      mockGenerateEmbedding.mockRejectedValueOnce(new Error("no embedding"));
      mockRawQuery.mockResolvedValueOnce([]);
      await hybridSearch("q", { assessed: "unassessed", minImportance: 0.45 });
      const [sql, params] = mockRawQuery.mock.calls[0]!;
      expect(sql).toContain("a.status IS NULL");
      expect(sql).toContain("c.importance >= $2");
      expect(sql).toContain("LIMIT $3");
      // query, minImportance, limit
      expect(params).toHaveLength(3);
    });
  });

  describe("findSimilarClaims", () => {
    it("finds similar claims by embedding", async () => {
      const embedding = new Array(1536).fill(0.1);
      mockRawQuery.mockResolvedValueOnce([
        {
          id: "claim-1",
          text: "Similar claim",
          claim_type: "empirical_derived",
          state: "active",
          semantic_score: 0.92,
          assessment_status: null,
          assessment_confidence: null,
        },
      ]);

      const results = await findSimilarClaims(embedding, {
        limit: 5,
        minSimilarity: 0.85,
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.similarity_score).toBe(0.92);
    });

    it("excludes specific claim ID", async () => {
      const embedding = new Array(1536).fill(0.1);
      mockRawQuery.mockResolvedValueOnce([]);

      await findSimilarClaims(embedding, {
        excludeId: "exclude-me",
      });

      // Verify the query was called with 4 params (includes exclude ID)
      const call = mockRawQuery.mock.calls[0]!;
      expect(call[1]).toHaveLength(4);
      expect(call[1]![3]).toBe("exclude-me");
    });
  });
});
