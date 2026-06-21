import type { AssessmentStatus } from "@/lib/types";
import { statusMeta } from "@/lib/ontology";

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
