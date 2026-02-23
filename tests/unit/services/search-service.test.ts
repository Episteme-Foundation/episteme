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
