import type { ClaimDetail } from "@/lib/types";
import {
  statusMeta, isStatus, CLAIM_TYPE_LABEL, decompositionNote,
  VERDICT_CONFIDENCE_GLOSS,
} from "@/lib/ontology";
import { StatusBadge, Credence, VerdictConfidence, Swatch, Importance } from "./Assessment";
import { DecompositionTree } from "./DecompositionTree";
import { ContributionRecord } from "./claim/ContributionRecord";
import { Contribute } from "./claim/Contribute";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function ClaimView({ detail }: { detail: ClaimDetail }) {
  const { claim, tree, instances, trajectory, subclaim_count, record } = detail;
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
          {/* Credence (P(claim true)) gets the meter, when the Steward stated
              one; verdict confidence is meta and stays a quiet labelled figure
              so the two are never mistaken for each other (#160). */}
          <Credence value={assessment.claim_credence} />
          <VerdictConfidence value={assessment.confidence} />
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
                {/* This score is the Extractor's, not the Matcher's: it says
                    "this passage states a genuine, well-formed claim", not how
                    well the passage matches the canonical form (#160). */}
                <span
                  className="conf-num"
                  title="The Extractor's confidence that this passage states a genuine, well-formed claim."
                >
                  extraction {inst.confidence.toFixed(2)}
                </span>
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

      {/* contribution record (#171) — the public exchanges, rendered as
          history after the claim's own content. Hidden entirely when no
          contribution has been made. */}
      {record && record.length > 0 && <ContributionRecord record={record} />}

      {/* contribution entry (#174): the companion of the contribution record
          above — the record shows past exchanges, this is where a new one
          starts. Kept at the end of the reading column so the page itself
          stays unmarked by the exchanges behind it. */}
      <Contribute claimId={claim.id} />

      <hr className="thin" />
      <p style={{ fontFamily: "var(--sans)", fontSize: ".74rem", color: "var(--faint)" }}>
        Created by {claim.created_by} · {fmtDate(claim.created_at)}.
        {/* claim.updated_at moves on any row touch (importance edits, canonical
            rewording, decomposition bookkeeping); only assessed_at is honestly
            "last assessed" (#160). */}
        {assessment && <> Last assessed {fmtDate(assessment.assessed_at)}.</>}
        {" "}Every judgment on this page is accompanied by a reasoning trace.
      </p>
    </article>
  );
}
