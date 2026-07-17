import type { ClaimDetail } from "@/lib/types";
import { statusMeta, isStatus, CLAIM_TYPE_LABEL, decompositionNote } from "@/lib/ontology";
import { StatusBadge, Confidence, Swatch, Importance } from "./Assessment";
import { DecompositionTree } from "./DecompositionTree";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function ClaimView({ detail }: { detail: ClaimDetail }) {
  const { claim, tree, instances, trajectory, subclaim_count } = detail;
  // Live data can be mid-pipeline: an assessment row may exist with a null
  // status. Only treat it as a real assessment when the status is on-enum.
  const assessment =
    detail.assessment && isStatus(detail.assessment.status) ? detail.assessment : null;
  const claimTypeLabel = CLAIM_TYPE_LABEL[claim.claim_type] ?? claim.claim_type?.replace(/_/g, " ");
  const hasTree = !!(tree && tree.children && tree.children.length > 0);

  return (
    <article className="col">
      {/* eyebrow: type + state */}
      <div className="claim-eyebrow">
        <span className="sc">Claim</span>
        <span className="tag kind">{claimTypeLabel}</span>
        {claim.state !== "active" && <span className="tag">{claim.state.replace(/_/g, " ")}</span>}
        {typeof claim.importance === "number" && (
          <span style={{ marginLeft: "auto" }}>
            <Importance value={claim.importance} showLabel />
          </span>
        )}
      </div>

      {/* hero: the canonical claim */}
      <h1 className="claim-hero">{claim.text}</h1>

      {!assessment && (
        <p style={{ fontFamily: "var(--sans)", fontSize: ".82rem", color: "var(--muted)", marginTop: "-.5rem" }}>
          Not yet assessed — this claim has been extracted but has not completed the
          assessment pipeline.
        </p>
      )}

      {/* assessment band */}
      {assessment && (
        <div className="claim-assess">
          <StatusBadge status={assessment.status} size="lg" />
          <span className="conf" aria-label="confidence">
            <span className="sc" style={{ marginRight: ".1rem" }}>confidence</span>
            <Confidence value={assessment.confidence} status={assessment.status} />
          </span>
          {/* No subclaim-status chips here: subclaim_summary is never computed
              by the pipeline (always {}), so the chips only ever rendered for
              fixtures — a feature that looked implemented but wasn't (#160).
              The margin compass gives the real breakdown, scored by effect on
              this claim rather than by each subclaim's own status. */}
        </div>
      )}

      {/* reasoning trace + trajectory sidenote */}
      {assessment && (
        <section>
          {trajectory && trajectory.history.length > 1 && (
            <aside className="sidenote">
              <span className="sc">Assessment history</span>
              <div className="traj">
                {trajectory.history.map((p, i) => (
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
                {trajectory.status_transitions} status change{trajectory.status_transitions === 1 ? "" : "s"} over {trajectory.total_assessments} assessments.
              </span>
            </aside>
          )}
          <h2>Assessment</h2>
          <p style={{ color: "var(--muted)", fontFamily: "var(--sans)", fontSize: ".8rem", marginTop: "-.3rem" }}>
            {statusMeta(assessment.status).def}
          </p>
          {/* Reader-facing assessment — the primary content, styled as lead prose
              rather than an inset box. The fuller reasoning trace stays accessible
              just below, behind a disclosure, for anyone who wants the full
              defensible chain. Older assessments have no distinct summary (the API
              returns the trace as the summary); only show the separate reasoning
              disclosure when it actually differs. */}
          <div className="assessment-body">
            {assessment.summary.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          {assessment.reasoning_trace &&
            assessment.reasoning_trace !== assessment.summary && (
              <details className="reasoning-detail">
                <summary>Full reasoning — evidence and decisions behind this verdict</summary>
                <div className="reasoning">
                  {assessment.reasoning_trace.split(/\n{2,}/).map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </details>
            )}
        </section>
      )}

      {/* decomposition */}
      <section>
        <h2>Decomposition</h2>
        {hasTree ? (
          <>
            <p style={{ color: "var(--muted)", fontFamily: "var(--sans)", fontSize: ".8rem", marginTop: "-.3rem" }}>
              {subclaim_count} subclaim{subclaim_count === 1 ? "" : "s"}, grouped by argument.
              Click a subclaim to see why the edge holds; ▸ expands; ↗ opens the subclaim.
            </p>
            <DecompositionTree tree={tree!} />
          </>
        ) : (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            {decompositionNote({
              decompositionStatus: claim.decomposition_status,
              assessed: !!assessment,
              stewardState: claim.steward_state,
            })}
          </p>
        )}
      </section>

      {/* provenance */}
      {instances && instances.length > 0 && (
        <section>
          <h2>Provenance</h2>
          <p style={{ color: "var(--muted)", fontFamily: "var(--sans)", fontSize: ".8rem", marginTop: "-.3rem" }}>
            Where this claim has been said, linked to its canonical form.
          </p>
          {instances.map((inst) => (
            <div className="instance" key={inst.id}>
              <blockquote>{inst.original_text}</blockquote>
              <div className="instance-cite">
                {inst.source_url ? (
                  <a href={inst.source_url}>{inst.source_title}</a>
                ) : (
                  <span>{inst.source_title}</span>
                )}
                {inst.source_type && <span className="tag">{inst.source_type.replace(/_/g, " ")}</span>}
                <span className="conf-num" title="match confidence">match {inst.confidence.toFixed(2)}</span>
              </div>
              {inst.context && (
                <p style={{ fontFamily: "var(--sans)", fontSize: ".78rem", color: "var(--muted)", margin: ".35rem 0 0" }}>
                  {inst.context}
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      <hr className="thin" />
      <p style={{ fontFamily: "var(--sans)", fontSize: ".74rem", color: "var(--faint)" }}>
        Created by {claim.created_by} · {fmtDate(claim.created_at)}. Last assessed {fmtDate(claim.updated_at)}.
        Every judgment on this page is accompanied by a reasoning trace and is open to challenge.
      </p>
    </article>
  );
}
