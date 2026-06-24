import type { ClaimDetail } from "@/lib/types";
import { statusMeta } from "@/lib/ontology";
import { Swatch } from "@/components/Assessment";
import styles from "./margins.module.css";

type Trajectory = NonNullable<ClaimDetail["trajectory"]>;

function fmtDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// The assessment-history timeline, living in the right margin below the
// dependents (where ClaimView's floated sidenote used to be). Styled as the
// original Tufte sidenote — quiet sans at sidenote scale — and dropping down in
// normal flow when the dependents above it expand, so nothing overlaps.
export function HistoryRail({ trajectory }: { trajectory: Trajectory }) {
  const history = trajectory.history ?? [];
  if (history.length <= 1) return null;

  return (
    <aside className={`${styles.rail} ${styles.histNote}`} aria-label="Assessment history">
      <span className="sc">Assessment history</span>
      <div className="traj">
        {history.map((p, i) => (
          <div className="traj-point" key={i}>
            <span className="traj-dot"><Swatch status={p.status} /></span>
            <span className="traj-body">
              <span className="sc" style={{ color: "var(--muted)" }}>{fmtDate(p.assessed_at)}</span>
              {statusMeta(p.status).label} · {typeof p.confidence === "number" ? p.confidence.toFixed(2) : "—"}
              {p.trigger && <em style={{ color: "var(--faint)" }}> — {p.trigger.replace(/_/g, " ")}</em>}
            </span>
          </div>
        ))}
      </div>
      <span style={{ color: "var(--faint)" }}>
        {trajectory.status_transitions} status change{trajectory.status_transitions === 1 ? "" : "s"} over{" "}
        {trajectory.total_assessments} assessments.
      </span>
    </aside>
  );
}
