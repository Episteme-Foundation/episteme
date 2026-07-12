import { describe, it, expect } from "vitest";
import {
  computeStructuralMetrics,
  type GraphSnapshot,
} from "../../../scripts/corpus/metrics.js";

// A small hand-built graph:
//   root (top-level, has instance) —requires→ a —requires→ b (leaf)
//                                   —supports→ shared (leaf)
//   root2 (top-level, has instance) —requires→ shared (leaf, shared → 2 parents)
// root: importance 0.8, atomic? no. leaves a/b/shared varied.
function fixture(): GraphSnapshot {
  return {
    claims: [
      { id: "root", text: "A genuinely contestable proposition about the world", claimType: "causal", importance: 0.8, createdBy: "extractor" },
      { id: "root2", text: "Another top-level claim here", claimType: "empirical_derived", importance: 0.6, createdBy: "extractor" },
      { id: "a", text: "Intermediate dependency claim", claimType: "empirical_derived", importance: 0.5, createdBy: "claim_steward" },
      { id: "b", text: "Deep leaf bedrock fact", claimType: "empirical_derived", importance: 0.3, createdBy: "claim_steward" },
      { id: "shared", text: "A dependency two claims lean on", claimType: "empirical_derived", importance: 0.4, createdBy: "claim_steward" },
    ],
    edges: [
      { parent: "root", child: "a", rel: "requires" },
      { parent: "a", child: "b", rel: "requires" },
      { parent: "root", child: "shared", rel: "supports" },
      { parent: "root2", child: "shared", rel: "requires" },
    ],
    assessments: [
      { claimId: "root", status: "contested", confidence: 0.7, reasoningTrace: "x".repeat(200) },
      { claimId: "root2", status: "verified", confidence: 0.9, reasoningTrace: "y".repeat(100) },
      { claimId: "a", status: "supported", confidence: 0.6, reasoningTrace: "" },
    ],
    instances: [{ claimId: "root" }, { claimId: "root" }, { claimId: "root2" }],
    sourceWords: 1000,
  };
}

describe("computeStructuralMetrics", () => {
  const m = computeStructuralMetrics(fixture());

  it("counts top-level claims by instance presence", () => {
    expect(m.extraction.topLevelClaims).toBe(2); // root, root2
    expect(m.extraction.instances).toBe(3);
    expect(m.extraction.totalClaims).toBe(5);
    expect(m.extraction.claimsPer1kWords).toBe(5); // 5 claims / 1000 words * 1000
  });

  it("computes canonical-form word-count stats", () => {
    expect(m.canonicalForm.wordCount.max).toBeGreaterThanOrEqual(7);
    expect(m.canonicalForm.overLongShare).toBe(0); // none > 25 words
  });

  it("derives the dedup ratio", () => {
    expect(m.matching.dedupRatio).toBe(1.5); // 3 instances / 2 top-level
  });

  it("measures decomposition depth without exploding on a shared DAG node", () => {
    // root → a → b is depth 3; shared is reachable from root and root2 but
    // must not be double-counted or loop.
    expect(m.decomposition.maxDepth).toBe(2); // root: max(a→b = 2, shared = 1)
    expect(m.decomposition.depthHistogram[2]).toBe(1); // root
    expect(m.decomposition.depthHistogram[1]).toBe(1); // root2 → shared
    // leaves b and shared are atomic → 2 of 5
    expect(m.decomposition.atomicShare).toBeCloseTo(0.4, 5);
  });

  it("counts subclaims shared across parents", () => {
    expect(m.crossDoc.sharedSubclaims).toBe(1); // "shared" has 2 parents
  });

  it("summarizes assessments and traces", () => {
    expect(m.assessment.statusDistribution).toEqual({ contested: 1, verified: 1, supported: 1 });
    // only root & root2 have a substantive (>40 char) trace; a has empty trace
    expect(m.assessment.pctWithTrace).toBeCloseTo(2 / 3, 5);
  });

  it("splits importance for atomic vs compound claims", () => {
    // compound: root(0.8), root2(0.6), a(0.5); atomic: b(0.3), shared(0.4)
    // (means are rounded to 3 dp)
    expect(m.importance.meanCompound).toBeCloseTo((0.8 + 0.6 + 0.5) / 3, 3);
    expect(m.importance.meanAtomic).toBeCloseTo((0.3 + 0.4) / 2, 5);
  });

  it("does not loop on a cycle", () => {
    const g = fixture();
    g.edges.push({ parent: "b", child: "root", rel: "requires" }); // b → root cycle
    const cyc = computeStructuralMetrics(g);
    expect(Number.isFinite(cyc.decomposition.maxDepth)).toBe(true);
  });
});
