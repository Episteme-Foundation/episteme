import Link from "next/link";
import type { ClaimDetail } from "@/lib/types";
import { statusMeta, VERDICT_CONFIDENCE_GLOSS } from "@/lib/ontology";
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
// This is the at-a-glance summary; the full record (contributions, decisions,
// arbitration) lives at /claims/:id/history (issue #175).
export function HistoryRail({
  trajectory, claimId,
}: { trajectory: Trajectory; claimId?: string }) {
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
              {statusMeta(p.status).label}
              {typeof p.confidence === "number" && (
                <span title={VERDICT_CONFIDENCE_GLOSS}> · {p.confidence.toFixed(2)}</span>
              )}
              {p.trigger && <em style={{ color: "var(--faint)" }}> — {p.trigger.replace(/_/g, " ")}</em>}
            </span>
          </div>
        ))}
      </div>
      <span style={{ color: "var(--faint)" }}>
        {trajectory.status_transitions} status change{trajectory.status_transitions === 1 ? "" : "s"} over{" "}
        {trajectory.total_assessments} assessments.
      </span>
      {claimId && (
        <p style={{ margin: "0.45rem 0 0" }}>
          <Link className="sc" href={`/claims/${claimId}/history`}>
            ▸ full history
          </Link>
        </p>
      )}
    </aside>
  );
}
