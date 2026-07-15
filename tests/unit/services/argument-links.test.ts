import { describe, it, expect } from "vitest";

// Mock the db client so importing the service never touches a real pool.
import { vi } from "vitest";
vi.mock("../../../src/db/client.js", () => ({
  getDb: vi.fn(),
  rawQuery: vi.fn(),
}));

import {
  parseClaimLinks,
  hasWrittenForm,
} from "../../../src/services/argument-service.js";

const A = "11111111-2222-3333-4444-555555555555";
const B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("parseClaimLinks", () => {
  it("extracts bare [[claim:<uuid>]] references in order", () => {
    const links = parseClaimLinks(
      `Because [[claim:${A}]] and [[claim:${B}]], the claim follows.`
    );
    expect(links).toEqual([
      { claimId: A, display: null },
      { claimId: B, display: null },
    ]);
  });

  it("extracts the display text of [[claim:<uuid>|inline phrasing]]", () => {
    const links = parseClaimLinks(
      `Given [[claim:${A}|the CMB measurements]], the claim follows.`
    );
    expect(links).toEqual([{ claimId: A, display: "the CMB measurements" }]);
  });

  it("lowercases ids so links match claim uuids regardless of case", () => {
    const links = parseClaimLinks(`[[claim:${A.toUpperCase()}]]`);
    expect(links).toEqual([{ claimId: A, display: null }]);
  });

  it("ignores malformed references", () => {
    expect(parseClaimLinks("[[claim:not-a-uuid]]")).toEqual([]);
    expect(parseClaimLinks(`[claim:${A}]`)).toEqual([]);
    expect(parseClaimLinks("plain prose without links")).toEqual([]);
  });

  it("returns duplicates as written (mutual-checkability counts references)", () => {
    const links = parseClaimLinks(`[[claim:${A}]] and again [[claim:${A}]]`);
    expect(links).toHaveLength(2);
  });
});

describe("hasWrittenForm", () => {
  it("is false for the creation-time label placeholder", () => {
    expect(hasWrittenForm("The poverty-reduction argument")).toBe(false);
  });

  it("is true once the content references a subclaim inline", () => {
    expect(
      hasWrittenForm(`Because [[claim:${A}]], the claim follows.`)
    ).toBe(true);
  });
});
