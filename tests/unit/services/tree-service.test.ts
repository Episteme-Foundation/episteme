import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db client
vi.mock("../../../src/db/client.js", () => ({
  rawQuery: vi.fn(),
}));

import { getClaimTree, getSubclaimCount } from "../../../src/services/tree-service.js";
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
