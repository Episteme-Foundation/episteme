import type { AssessmentStatus } from "@/lib/types";
import {
  statusMeta, importanceLevel, IMPORTANCE, UNASSESSED_META, DEFINED_IN,
  CREDENCE_GLOSS, VERDICT_CONFIDENCE_GLOSS,
} from "@/lib/ontology";
import { Term } from "./Term";

export function StatusBadge({
  status, size = "sm",
}: { status: AssessmentStatus | string | null; size?: "sm" | "lg" }) {
  const s = statusMeta(status);
  return (
    <Term gloss={s.def} href={DEFINED_IN.status} className={`badge ${s.cls}${size === "lg" ? " lg" : ""}`}>
      <span className="badge-glyph" aria-hidden>{s.glyph}</span>
      {s.label}
    </Term>
  );
}

export function Swatch({ status }: { status: AssessmentStatus | string | null }) {
  const s = statusMeta(status);
  return <span className={`swatch ${s.cls}`} title={`${s.label} — ${s.def}`} aria-label={s.label} />;
}

// Shown in place of a StatusBadge when a claim has no current assessment. The
// dashed, muted treatment signals "still queued" rather than a verdict — many
// low-importance claims sit unassessed under the Steward's budget by design.
export function Unassessed() {
  return (
    <Term gloss={UNASSESSED_META.def} href={DEFINED_IN.importance} className="badge unassessed">
      Unassessed
    </Term>
  );
}

// Importance is rendered as a neutral five-pip meter, deliberately NOT coloured
// by assessment status so it never competes with the verdict. The numeric value
// and band live in the popover; `showLabel` adds the band name inline.
export function Importance({
  value, showLabel = false,
}: { value: number | null | undefined; showLabel?: boolean }) {
  if (typeof value !== "number") return null;
  const level = importanceLevel(value);
  const meta = IMPORTANCE[level];
  const gloss = `Importance ${value.toFixed(2)}, from 0 to 1 · ${meta.label}: ${meta.gloss}. The Steward assesses and decomposes higher-importance claims first.`;
  return (
    <Term gloss={gloss} href={DEFINED_IN.importance} className="imp" ariaLabel={`importance: ${meta.label}`}>
      <span className="imp-pips" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`imp-pip${i <= meta.pips ? " on" : ""}`} />
        ))}
      </span>
      {showLabel && <span className="imp-label">{meta.label}</span>}
    </Term>
  );
}

// Credence — the Steward's probability that the claim is true. The one number
// that earns a meter; deliberately neutral-coloured so it never reads as a
// restatement of the verdict. Renders nothing when no credence was stated:
// per constitution §7 the absence is a signal, not a gap to paper over.
export function Credence({ value }: { value: number | null | undefined }) {
  if (typeof value !== "number") return null;
  return (
    <Term gloss={CREDENCE_GLOSS} href={DEFINED_IN.confidence} className="conf credence">
      <span className="sc" style={{ marginRight: ".1rem" }}>credence</span>
      <span className="conf-track">
        <span className="conf-fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="conf-num">{value.toFixed(2)}</span>
    </Term>
  );
}

// Verdict confidence — how sure the Steward is of the status itself. Meta, so
// it stays quiet: a small labelled figure, no meter, defined on hover/click.
export function VerdictConfidence({ value }: { value: number | null | undefined }) {
  if (typeof value !== "number") return null;
  return (
    <Term gloss={VERDICT_CONFIDENCE_GLOSS} href={DEFINED_IN.confidence} className="conf-quiet">
      verdict confidence {value.toFixed(2)}
    </Term>
  );
}
