import type { AssessmentStatus } from "@/lib/types";
import { statusMeta, importanceLevel, IMPORTANCE } from "@/lib/ontology";

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

// Importance is rendered as a neutral five-pip meter, deliberately NOT coloured
// by assessment status so it never competes with the verdict. The numeric value
// and band live in the tooltip; `showLabel` adds the band name inline.
export function Importance({
  value, showLabel = false,
}: { value: number | null | undefined; showLabel?: boolean }) {
  if (typeof value !== "number") return null;
  const level = importanceLevel(value);
  const meta = IMPORTANCE[level];
  const title = `importance ${value.toFixed(2)} · ${meta.label} — ${meta.gloss}. The Steward assesses and decomposes higher-importance claims first.`;
  return (
    <span className="imp" title={title} aria-label={`importance: ${meta.label}`}>
      <span className="imp-pips" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`imp-pip${i <= meta.pips ? " on" : ""}`} />
        ))}
      </span>
      {showLabel && <span className="imp-label">{meta.label}</span>}
    </span>
  );
}

export function Confidence({
  value, status,
}: { value: number | null | undefined; status?: AssessmentStatus | string | null }) {
  const cls = statusMeta(status).cls;
  const v = typeof value === "number" ? value : null;
  return (
    <span className={`conf ${cls}`}>
      <span className="conf-track">
        <span className="conf-fill" style={{ width: `${v === null ? 0 : Math.round(v * 100)}%` }} />
      </span>
      <span className="conf-num">{v === null ? "—" : v.toFixed(2)}</span>
    </span>
  );
}
