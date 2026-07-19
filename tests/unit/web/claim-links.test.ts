import { describe, it, expect } from "vitest";

// The web-side prose parser (issue #203): assessment summaries and reasoning
// traces carry the same [[claim:<id>]] references as argument written forms,
// plus bare source URLs. Pure string → segments, so it tests without a DOM.
import { parseProse } from "../../../web/lib/claim-links";

const A = "11111111-2222-3333-4444-555555555555";

describe("parseProse", () => {
  it("passes plain prose through as one text segment (pre-#203 assessments)", () => {
    expect(parseProse("No links here, just prose.")).toEqual([
      { kind: "text", text: "No links here, just prose." },
    ]);
  });

  it("splits claim links and bare URLs out of the same paragraph", () => {
    const segs = parseProse(
      `Rests on [[claim:${A}|the measured figure]], per https://www.bls.gov/cpi.htm today.`
    );
    expect(segs).toEqual([
      { kind: "text", text: "Rests on " },
      { kind: "link", claimId: A, display: "the measured figure" },
      { kind: "text", text: ", per " },
      { kind: "url", href: "https://www.bls.gov/cpi.htm" },
      { kind: "text", text: " today." },
    ]);
  });

  it("trims sentence punctuation off the end of a URL", () => {
    const segs = parseProse("See https://example.com/report.");
    expect(segs).toContainEqual({ kind: "url", href: "https://example.com/report" });
    expect(segs[segs.length - 1]).toEqual({ kind: "text", text: "." });
  });

  it("drops a closing paren the URL never opened, keeps one it did", () => {
    const closed = parseProse("(https://example.com/a)");
    expect(closed).toContainEqual({ kind: "url", href: "https://example.com/a" });
    const wiki = parseProse("https://en.wikipedia.org/wiki/Inflation_(economics)");
    expect(wiki).toContainEqual({
      kind: "url",
      href: "https://en.wikipedia.org/wiki/Inflation_(economics)",
    });
  });

  it("leaves a bare scheme with nothing after it as plain text", () => {
    expect(parseProse("The https:// prefix alone links nothing.")).toEqual([
      { kind: "text", text: "The https:// prefix alone links nothing." },
    ]);
  });
});
