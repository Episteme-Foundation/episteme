import type {
  AssessmentStatus, ClaimType, RelationType, Stance, TreeNode,
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

// Decomposition status — the backend stores this as a free-text column with four
// values (pending → processing → atomic | complete). The UI must not conflate
// "atomic" (decomposed and found irreducible) with "pending" (not yet looked at).
export type DecompositionState = "atomic" | "complete" | "processing" | "pending";

export function decompositionState(status: string): DecompositionState {
  if (status === "atomic" || status === "complete") return status;
  if (status === "processing") return "processing";
  return "pending";
}

// "Atomic" claims have finished decomposition with no subclaims; both the
// terminal statuses count, since a complete decomposition that produced no
// children is, in effect, atomic.
export function isAtomic(status: string): boolean {
  return status === "atomic" || status === "complete";
}

// Has the Steward actually processed this claim? Only then can "no subclaims"
// mean "irreducible" rather than "not looked at yet". A claim is processed if it
// carries a current assessment or its steward queue state has reached "done".
export function isProcessed(opts: { assessed: boolean; stewardState?: string }): boolean {
  return opts.assessed || opts.stewardState === "done";
}

// The decomposition section's caption when there are no rendered subclaims. The
// correction this encodes: under the Steward's importance budget most low-value
// claims are left queued, so an unprocessed claim with no children is NOT atomic
// — it simply hasn't been decomposed yet and very likely still will be. We only
// call a claim atomic once it has actually been processed and found irreducible.
export function decompositionNote(opts: {
  decompositionStatus: string;
  assessed: boolean;
  stewardState?: string;
}): string {
  if (opts.stewardState === "running") {
    return "This claim is being decomposed — its subclaims are still being worked out.";
  }
  if (isProcessed(opts)) {
    return isAtomic(opts.decompositionStatus)
      ? "This claim is atomic — it bottoms out in a bedrock fact, a contested empirical question, or a value premise, and does not decompose further."
      : "This claim has been assessed but its decomposition is not yet recorded.";
  }
  return "This claim has not been assessed yet — the Steward works through claims in order of importance, so lower-importance claims wait their turn. It may well decompose into subclaims once it is processed.";
}

// Claim importance — how much it is worth spending scarce intelligence to get the
// claim right (roughly consequence-if-wrong × contestability), 0..1, a revisable
// judgment set by the Steward that orders its work queue. NOT mere graph
// centrality: an uncontested claim is low importance even when much depends on it,
// because getting a settled fact right is essentially free (#68). We bucket the
// continuous score into five named bands for display and keep the exact value for
// the tooltip. The default for an unjudged claim is 0.5, so a "notable" reading is
// not necessarily a deliberate judgment.
// The union keys are historical; the user-facing wording lives in `label`/`gloss`.
export type ImportanceLevel = "foundational" | "high" | "medium" | "low" | "peripheral";

export const IMPORTANCE_ORDER: ImportanceLevel[] = [
  "peripheral", "low", "medium", "high", "foundational",
];

export function importanceLevel(v: number): ImportanceLevel {
  if (v >= 0.85) return "foundational";
  if (v >= 0.65) return "high";
  if (v >= 0.45) return "medium";
  if (v >= 0.25) return "low";
  return "peripheral";
}

export const IMPORTANCE: Record<ImportanceLevel, { label: string; pips: number; gloss: string }> = {
  foundational: { label: "central",  pips: 5, gloss: "consequential and genuinely contested — a live crux" },
  high:         { label: "major",    pips: 4, gloss: "real consequence within a domain, actively argued" },
  medium:       { label: "notable",  pips: 3, gloss: "a contested point in a live debate (also the default before judging)" },
  low:          { label: "minor",    pips: 2, gloss: "narrow or largely settled — cheap to get right" },
  peripheral:   { label: "settled",  pips: 1, gloss: "uncontested — low even if much depends on it" },
};

// Minimum-importance bands for the browse/search filter. Each `min` is the lower
// bound of an importanceLevel() band, so e.g. "high" means "high or foundational".
// Kept in lockstep with importanceLevel()'s cut points above.
export type ImportanceFloor = "any" | "low" | "medium" | "high" | "foundational";

export const IMPORTANCE_FLOORS: { value: ImportanceFloor; label: string; short: string; min: number }[] = [
  { value: "any",          label: "Any importance", short: "Any",     min: 0 },
  { value: "low",          label: "Minor & up",     short: "Minor",   min: 0.25 },
  { value: "medium",       label: "Notable & up",   short: "Notable", min: 0.45 },
  { value: "high",         label: "Major & up",     short: "Major",   min: 0.65 },
  { value: "foundational", label: "Central",        short: "Central", min: 0.85 },
];

// URL band value → numeric floor passed to the API (0 = no constraint).
export function importanceFloorMin(value: string | undefined): number {
  return IMPORTANCE_FLOORS.find((f) => f.value === value)?.min ?? 0;
}

// Numeric floor → the band value, so a shared link round-trips back into the
// dropdown's selected option.
export function importanceFloorValue(min: number | undefined): ImportanceFloor {
  if (!min) return "any";
  let match: ImportanceFloor = "any";
  for (const f of IMPORTANCE_FLOORS) if (min >= f.min) match = f.value;
  return match;
}

// ---------------------------------------------------------------------------
// Effect on the parent claim — "what does this subclaim do to the claim above
// it", as distinct from "how verified is this subclaim". Colouring decomposition
// by a subclaim's own status is misleading: a *verified* subclaim on a
// `contradicts` edge is strong evidence AGAINST the parent, yet it would read as
// reassuring green. So we score every node by its effect on the ROOT claim,
// composing edge polarity down the tree (`contradicts` flips the sign) and
// combining it with how established the node itself is.
// ---------------------------------------------------------------------------

export type Effect = "supports" | "against" | "uncertain" | "weak";

export const EFFECT: Record<Effect, { label: string; cls: string; gloss: string }> = {
  supports:  { label: "in favour", cls: "st-supported",    gloss: "established evidence that bears in favour of this claim" },
  against:   { label: "against",   cls: "st-contradicted", gloss: "established evidence that weighs against this claim" },
  uncertain: { label: "contested", cls: "st-contested",    gloss: "credible argument exists on more than one side" },
  weak:      { label: "unsettled", cls: "st-unknown",      gloss: "too unsupported or unknown to move the needle either way" },
};

// Reading order for the bar/legend: favour, contested, against, unsettled. We
// deliberately do NOT lead with "verified" — the point is to stop the eye
// reading green-first when the green doesn't actually support the claim.
export const EFFECT_ORDER: Effect[] = ["supports", "uncertain", "against", "weak"];

// Only `contradicts` reverses polarity. requires / supports / specifies /
// defines / presupposes are all structurally affirmative edges.
function flipsPolarity(relation: string | null): boolean {
  return relation === "contradicts";
}

// sign: +1 if, walking from the root, this node ultimately bears in favour of
// the root; -1 if it bears against it.
function nodeEffect(status: string | null, sign: number): Effect {
  if (status === "contested") return "uncertain";
  let truth = 0; // +1 established, -1 refuted, 0 unknown
  if (status === "verified" || status === "supported") truth = 1;
  else if (status === "contradicted") truth = -1;
  const contribution = sign * truth;
  if (contribution > 0) return "supports";
  if (contribution < 0) return "against";
  return "weak";
}

export interface ScoredNode {
  node: TreeNode;
  effect: Effect;
}

// Flatten the decomposition (excluding the root) in outline order, tagging each
// node with its effect on the root claim.
export function decompositionEffects(root: TreeNode): ScoredNode[] {
  const out: ScoredNode[] = [];
  const walk = (node: TreeNode, sign: number) => {
    for (const child of node.children) {
      const childSign = flipsPolarity(child.relation_type) ? -sign : sign;
      out.push({ node: child, effect: nodeEffect(child.assessment_status, childSign) });
      walk(child, childSign);
    }
  };
  walk(root, 1);
  return out;
}

export function effectCounts(scored: ScoredNode[]): Record<Effect, number> {
  const counts: Record<Effect, number> = { supports: 0, against: 0, uncertain: 0, weak: 0 };
  for (const s of scored) counts[s.effect] += 1;
  return counts;
}

// Collapse a set of effects into a single net effect for an argument: which way,
// on balance, does this line of reasoning push the main claim? A genuine split
// reads as contested; an argument with nothing established reads as unsettled.
export function netEffect(counts: Record<Effect, number>): Effect {
  if (counts.supports > counts.against) return "supports";
  if (counts.against > counts.supports) return "against";
  if (counts.supports > 0 || counts.uncertain > 0) return "uncertain";
  return "weak";
}

export interface ArgumentGroup {
  id: string | null;
  name: string | null;
  stance: Stance | null;
  named: boolean;
  nodes: ScoredNode[];
  counts: Record<Effect, number>;
  net: Effect;
}

// Group scored subclaims by the argument their edge belongs to, preserving
// first-appearance order. The argument primitive is OPTIONAL: nodes with no
// named argument collect into a single unnamed group, so a decomposition that
// never names an argument still renders as a flat outline.
export function groupByArgument(scored: ScoredNode[]): ArgumentGroup[] {
  const groups: ArgumentGroup[] = [];
  const byId = new Map<string | null, ArgumentGroup>();
  for (const s of scored) {
    const id = s.node.argument_name ? s.node.argument_id : null;
    let g = byId.get(id);
    if (!g) {
      g = {
        id,
        name: s.node.argument_name ?? null,
        stance: s.node.argument_stance ?? null,
        named: Boolean(s.node.argument_name),
        nodes: [],
        counts: { supports: 0, against: 0, uncertain: 0, weak: 0 },
        net: "weak",
      };
      byId.set(id, g);
      groups.push(g);
    }
    g.nodes.push(s);
    g.counts[s.effect] += 1;
  }
  for (const g of groups) g.net = netEffect(g.counts);
  return groups;
}
