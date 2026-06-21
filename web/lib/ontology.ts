import type {
  AssessmentStatus, ClaimType, RelationType, Stance,
} from "./types";

// Status metadata. Definitions are verbatim from the Admin Constitution §7 so
// the UI teaches the same vocabulary the agents reason in.
export const STATUS: Record<
  AssessmentStatus,
  { label: string; glyph: string; cls: string; def: string }
> = {
  verified: {
    label: "Verified", glyph: "✓", cls: "st-verified",
    def: "The claim traces to reliable primary sources through a clear chain of evidence.",
  },
  supported: {
    label: "Supported", glyph: "↑", cls: "st-supported",
    def: "Evidence favors the claim, but the chain is incomplete or the sources are secondary.",
  },
  contested: {
    label: "Contested", glyph: "⇄", cls: "st-contested",
    def: "Credible evidence or argument exists on multiple sides.",
  },
  unsupported: {
    label: "Unsupported", glyph: "○", cls: "st-unsupported",
    def: "No credible evidence found, though the claim is not contradicted.",
  },
  contradicted: {
    label: "Contradicted", glyph: "✕", cls: "st-contradicted",
    def: "Available evidence weighs against the claim.",
  },
  unknown: {
    label: "Unknown", glyph: "?", cls: "st-unknown",
    def: "Insufficient information to assess.",
  },
};

export const STATUS_ORDER: AssessmentStatus[] = [
  "verified", "supported", "contested", "unsupported", "contradicted", "unknown",
];

// Live data can be mid-pipeline: an assessment may exist with a null/unknown
// status. Treat anything off-enum as "unknown" so rendering never throws.
export function isStatus(s: unknown): s is AssessmentStatus {
  return typeof s === "string" && s in STATUS;
}
export function statusMeta(s: unknown) {
  return isStatus(s) ? STATUS[s] : STATUS.unknown;
}

export const RELATION: Record<RelationType, { label: string; cls: string; gloss: string }> = {
  requires:    { label: "requires",    cls: "rel-requires",    gloss: "the parent's truth depends on this" },
  supports:    { label: "supports",    cls: "rel-supports",    gloss: "this provides evidence for the parent" },
  contradicts: { label: "contradicts", cls: "rel-contradicts", gloss: "this argues against the parent" },
  specifies:   { label: "specifies",   cls: "rel-specifies",   gloss: "a more specific version of the parent" },
  defines:     { label: "defines",     cls: "rel-defines",     gloss: "defines a key term in the parent" },
  presupposes: { label: "presupposes", cls: "rel-presupposes", gloss: "an assumption the parent makes" },
};

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  empirical_verifiable: "empirical · verifiable",
  empirical_derived: "empirical · derived",
  definitional: "definitional",
  evaluative: "evaluative",
  causal: "causal",
  normative: "normative",
};

export const STANCE_LABEL: Record<Stance, string> = {
  for: "for", against: "against", neutral: "neutral",
};

export function confidenceLabel(c: number): string {
  return c.toFixed(2).replace(/^0/, "·");
}
