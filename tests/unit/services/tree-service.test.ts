import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db client
vi.mock("../../../src/db/client.js", () => ({
  rawQuery: vi.fn(),
}));

import { getClaimTree, getSubclaimCount, listClaimDependents } from "../../../src/services/tree-service.js";
import { rawQuery } from "../../../src/db/client.js";

const mockRawQuery = vi.mocked(rawQuery);

describe("tree-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getClaimTree", () => {
    it("returns null for non-existent claim", async () => {
      mockRawQuery.mockResolvedValueOnce([]);
      const result = await getClaimTree("00000000-0000-0000-0000-000000000001");
      expect(result).toBeNull();
    });

    it("assembles a single-node tree", async () => {
      mockRawQuery.mockResolvedValueOnce([
        {
          id: "claim-1",
          text: "Test claim",
          claim_type: "empirical_derived",
          state: "active",
          parent_id: null,
          relation_type: null,
          reasoning: null,
          confidence: null,
          depth: 0,
          assessment_status: "verified",
          assessment_confidence: 0.9,
        },
      ]);

      const tree = await getClaimTree("claim-1");
      expect(tree).not.toBeNull();
      expect(tree!.id).toBe("claim-1");
      expect(tree!.text).toBe("Test claim");
      expect(tree!.children).toHaveLength(0);
      expect(tree!.assessment_status).toBe("verified");
    });

    it("assembles a tree with children", async () => {
      mockRawQuery.mockResolvedValueOnce([
        {
          id: "parent",
          text: "Parent claim",
          claim_type: "empirical_derived",
          state: "active",
          parent_id: null,
          relation_type: null,
          reasoning: null,
          confidence: null,
          depth: 0,
          assessment_status: null,
          assessment_confidence: null,
        },
        {
          id: "child-1",
          text: "Child claim 1",
          claim_type: "empirical_derived",
          state: "active",
          parent_id: "parent",
          relation_type: "requires",
          reasoning: "Because A",
          confidence: 0.95,
          depth: 1,
          assessment_status: "verified",
          assessment_confidence: 0.85,
        },
        {
          id: "child-2",
          text: "Child claim 2",
          claim_type: "definitional",
          state: "active",
          parent_id: "parent",
          relation_type: "defines",
          reasoning: "Because B",
          confidence: 0.9,
          depth: 1,
          assessment_status: null,
          assessment_confidence: null,
        },
      ]);

      const tree = await getClaimTree("parent");
      expect(tree).not.toBeNull();
      expect(tree!.id).toBe("parent");
      expect(tree!.children).toHaveLength(2);
      expect(tree!.children[0]!.id).toBe("child-1");
      expect(tree!.children[0]!.relation_type).toBe("requires");
      expect(tree!.children[1]!.id).toBe("child-2");
      expect(tree!.children[1]!.relation_type).toBe("defines");
    });
  });

  describe("listClaimDependents", () => {
    const row = (id: string, importance: number, total: string) => ({
      id,
      text: `Claim ${id}`,
      claim_type: "causal",
      relation_type: "requires",
      importance,
      assessment_status: "contested",
      assessment_confidence: 0.5,
      total,
    });

    it("returns a page plus the window-function total, without the total column", async () => {
      mockRawQuery.mockResolvedValueOnce([row("a", 0.9, "12"), row("b", 0.7, "12")]);

      const result = await listClaimDependents("child-1", { limit: 2, offset: 0 });
      expect(result.total).toBe(12);
      expect(result.dependents).toHaveLength(2);
      expect(result.dependents[0]).not.toHaveProperty("total");
      expect(result.dependents[0]!.importance).toBe(0.9);

      // limit/offset are passed through to the query
      expect(mockRawQuery).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT $2 OFFSET $3"),
        ["child-1", 2, 0]
      );
    });

    it("falls back to a bare count when the offset is past the end", async () => {
      mockRawQuery.mockResolvedValueOnce([]); // page query: empty
      mockRawQuery.mockResolvedValueOnce([{ count: "12" }]); // count fallback

      const result = await listClaimDependents("child-1", { limit: 50, offset: 100 });
      expect(result.dependents).toEqual([]);
      expect(result.total).toBe(12);
    });

    it("reports zero total for a claim nothing depends on", async () => {
      mockRawQuery.mockResolvedValueOnce([]);
      mockRawQuery.mockResolvedValueOnce([{ count: "0" }]);

      const result = await listClaimDependents("leaf-1");
      expect(result).toEqual({ dependents: [], total: 0 });
    });

    it("orders by importance before assessment confidence", async () => {
      mockRawQuery.mockResolvedValueOnce([row("a", 0.9, "2")]);
      await listClaimDependents("child-1");
      const sql = mockRawQuery.mock.calls[0]![0] as string;
      expect(sql).toMatch(/ORDER BY c\.importance DESC, a\.confidence DESC NULLS LAST/);
    });
  });

  describe("getSubclaimCount", () => {
    it("returns count of subclaims", async () => {
      mockRawQuery.mockResolvedValueOnce([{ count: "3" }]);
      const count = await getSubclaimCount("claim-1");
      expect(count).toBe(3);
    });

    it("returns 0 when no subclaims", async () => {
      mockRawQuery.mockResolvedValueOnce([{ count: "0" }]);
      const count = await getSubclaimCount("claim-1");
      expect(count).toBe(0);
    });
  });
});
