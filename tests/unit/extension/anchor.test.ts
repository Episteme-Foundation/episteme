import { describe, it, expect } from "vitest";

// The anchoring math is DOM-free by design so the server repo's test suite
// can cover it; only buildTextIndex/occurrenceToRange touch the DOM.
import {
  findOccurrences,
  normalizeWithMap,
} from "../../../extension/lib/anchor";

describe("normalizeWithMap", () => {
  it("collapses whitespace runs and maps back to source offsets", () => {
    const { norm, map } = normalizeWithMap("a  b\n\tc");
    expect(norm).toBe("a b c");
    // 'c' in the normalized string maps to its source position
    expect(map[norm.indexOf("c")]).toBe(6);
  });

  it("drops leading and trailing whitespace", () => {
    expect(normalizeWithMap("  hello  ").norm).toBe("hello");
  });

  it("canonicalizes typographic quotes and dashes", () => {
    expect(normalizeWithMap("it’s “fine” — ok").norm).toBe(
      `it's "fine" - ok`
    );
  });
});

describe("findOccurrences", () => {
  it("finds a quote across differing whitespace", () => {
    const source = normalizeWithMap("The\n  economy   shrank by 3%\nlast year.");
    const [occ] = findOccurrences(source, "economy shrank by 3%");
    expect(occ).toBeDefined();
    // offsets point back into the ORIGINAL string
    expect("The\n  economy   shrank by 3%\nlast year.".slice(occ!.start, occ!.end)).toBe(
      "economy   shrank by 3%"
    );
  });

  it("matches typographic-vs-straight punctuation differences", () => {
    const source = normalizeWithMap("She said it’s “unprecedented”.");
    const hits = findOccurrences(source, `it's "unprecedented"`);
    expect(hits).toHaveLength(1);
  });

  it("falls back to case-insensitive matching", () => {
    const source = normalizeWithMap("INFLATION PEAKED IN 2022.");
    expect(findOccurrences(source, "Inflation peaked in 2022")).toHaveLength(1);
  });

  it("returns multiple occurrences up to the limit", () => {
    const source = normalizeWithMap("cats are great. cats are great. cats are great.");
    expect(findOccurrences(source, "cats are great", 2)).toHaveLength(2);
  });

  it("ignores quotes too short to anchor", () => {
    const source = normalizeWithMap("ab ab ab");
    expect(findOccurrences(source, "ab")).toHaveLength(0);
  });
});
