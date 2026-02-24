import { describe, it, expect, vi } from "vitest";

// Mock the LLM client to avoid SDK import issues
vi.mock("../../../../src/llm/client.js", () => ({
  completeStructured: vi.fn(),
}));

import { computeFallbackAssessment } from "../../../../src/llm/agents/assessor.js";

describe("assessor fallback", () => {
  it("returns unsupported when a subclaim is unsupported", () => {
    const result = computeFallbackAssessment([
      { relation: "requires", status: "verified", confidence: 0.9 },
      { relation: "requires", status: "unsupported", confidence: 0.3 },
      { relation: "supports", status: "verified", confidence: 0.8 },
    ]);

    expect(result.status).toBe("unsupported");
    expect(result.confidence).toBeCloseTo(0.3 * 0.9, 5);
  });

  it("returns contested when a subclaim is contested", () => {
    const result = computeFallbackAssessment([
      { relation: "requires", status: "verified", confidence: 0.9 },
      { relation: "requires", status: "contested", confidence: 0.5 },
    ]);

    expect(result.status).toBe("contested");
  });

  it("returns verified when all subclaims are verified", () => {
    const result = computeFallbackAssessment([
      { relation: "requires", status: "verified", confidence: 0.9 },
      { relation: "supports", status: "verified", confidence: 0.85 },
    ]);

    expect(result.status).toBe("verified");
    expect(result.confidence).toBeCloseTo(0.85 * 0.9, 5);
  });

  it("returns unknown when all subclaims are unknown", () => {
    const result = computeFallbackAssessment([
      { relation: "requires", status: "unknown", confidence: 0.0 },
      { relation: "requires", status: "unknown", confidence: 0.0 },
    ]);

    expect(result.status).toBe("unknown");
  });

  it("contested takes priority over unsupported", () => {
    const result = computeFallbackAssessment([
      { relation: "requires", status: "contested", confidence: 0.5 },
      { relation: "requires", status: "unsupported", confidence: 0.2 },
    ]);

    // Contested is more informative than unsupported -- genuine disagreement
    // is a stronger signal than absence of evidence
    expect(result.status).toBe("contested");
  });

  it("returns supported when mix of verified and supported subclaims", () => {
    const result = computeFallbackAssessment([
      { relation: "requires", status: "verified", confidence: 0.9 },
      { relation: "supports", status: "supported", confidence: 0.7 },
    ]);

    expect(result.status).toBe("supported");
  });

  it("returns contested when any subclaim is contradicted", () => {
    const result = computeFallbackAssessment([
      { relation: "requires", status: "verified", confidence: 0.9 },
      { relation: "contradicts", status: "contradicted", confidence: 0.8 },
    ]);

    // A contradicted subclaim means there's active evidence against,
    // so the overall claim is at minimum contested
    expect(result.status).toBe("contested");
  });

  it("returns unknown for empty subclaims", () => {
    const result = computeFallbackAssessment([]);

    expect(result.status).toBe("unknown");
  });
});
