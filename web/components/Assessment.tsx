import type { AssessmentStatus } from "@/lib/types";
import {
  statusMeta, importanceLevel, IMPORTANCE,
  CREDENCE_GLOSS, VERDICT_CONFIDENCE_GLOSS,
} from "@/lib/ontology";

export function StatusBadge({
  status, size = "sm",
}: { status: AssessmentStatus | string | null; size?: "sm" | "lg" }) {
  const s = statusMeta(status);
  return (
    <span className={`badge ${s.cls}${size === "lg" ? " lg" : ""}`} title={s.def}>
      <span className="badge-glyph" aria-hidden>{s.glyph}</span>
      {s.label}
    </span>
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
    <span
      className="badge unassessed"
      title="No current assessment — the Steward prioritises higher-importance claims, so this one is likely still queued."
    >
      Unassessed
    </span>
  );
}

// Importance is rendered as a neutral five-pip meter, deliberately NOT coloured
// by assessment status so it never competes with the verdict. The numeric value
// and band live in the tooltip; `showLabel` adds the band name inline.
export function Importance({
  value, showLabel = false,
}: { value: number | null | undefined; showLabel?: boolean }) {
  if (typeof value !== "number") return null;
  const level = importanceLevel(value);
  const meta = IMPORTANCE[level];
  const tip = `Importance ${value.toFixed(2)}, from 0 to 1 · ${meta.label}: ${meta.gloss}. The Steward assesses and decomposes higher-importance claims first.`;
  return (
    <span className="imp tip" data-tip={tip} tabIndex={0} aria-label={`importance: ${meta.label}`}>
      <span className="imp-pips" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`imp-pip${i <= meta.pips ? " on" : ""}`} />
        ))}
      </span>
      {showLabel && <span className="imp-label">{meta.label}</span>}
    </span>
  );
}

// Credence — the Steward's probability that the claim is true. The one number
// that earns a meter; deliberately neutral-coloured so it never reads as a
// restatement of the verdict. Renders nothing when no credence was stated:
// per constitution §7 the absence is a signal, not a gap to paper over.
export function Credence({ value }: { value: number | null | undefined }) {
  if (typeof value !== "number") return null;
  return (
    <span className="conf credence tip" data-tip={CREDENCE_GLOSS} tabIndex={0}>
      <span className="sc" style={{ marginRight: ".1rem" }}>credence</span>
      <span className="conf-track">
        <span className="conf-fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="conf-num">{value.toFixed(2)}</span>
    </span>
  );
}

// Verdict confidence — how sure the Steward is of the status itself. Meta, so
// it stays quiet: a small labelled figure, no meter, defined on hover.
export function VerdictConfidence({ value }: { value: number | null | undefined }) {
  if (typeof value !== "number") return null;
  return (
    <span className="conf-quiet tip" data-tip={VERDICT_CONFIDENCE_GLOSS} tabIndex={0}>
      verdict confidence {value.toFixed(2)}
    </span>
  );
}
