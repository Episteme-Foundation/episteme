import Link from "next/link";
import { loadClaims } from "@/lib/data";
import { CLAIM_TYPE_LABEL, IMPORTANCE_FLOORS, importanceFloorMin } from "@/lib/ontology";
import type { ImportanceFloor } from "@/lib/ontology";
import { StatusBadge, Unassessed, Importance } from "@/components/Assessment";
import { ClaimsControls } from "@/components/ClaimsControls";
import type { AssessedFilter } from "@/lib/types";

export default async function ClaimsIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; assessed?: string; imp?: string }>;
}) {
  const { q, assessed: assessedRaw, imp: impRaw } = await searchParams;

  // The browse feed defaults to assessed-only (the unassessed long tail is mostly
  // queued stubs). "all" and "unassessed" are opt-in; anything else is the default.
  const assessed: AssessedFilter =
    assessedRaw === "all" || assessedRaw === "unassessed" ? assessedRaw : "assessed";
  const impFloor: ImportanceFloor =
    IMPORTANCE_FLOORS.find((f) => f.value === impRaw)?.value ?? "any";
  const minImportance = importanceFloorMin(impFloor);
  const filtersActive = assessed !== "assessed" || minImportance > 0;

  const { results: claims, source } = await loadClaims(q, { assessed, minImportance });

  return (
    <div className="col-wide">
      <p className="sc" style={{ marginBottom: ".5rem" }}>Browse</p>
      <h1>Claims</h1>
      <p className="lede" style={{ fontSize: "1.05rem" }}>
        Search the graph by meaning. Each result carries its current verdict; open one to
        see its decomposition, provenance, and the reasoning behind the assessment.
      </p>

      <ClaimsControls q={q ?? ""} assessed={assessed} imp={impFloor} resultCount={claims.length} />

      {source === "fixture" && (
        <p style={{ marginTop: "-0.6rem", marginBottom: "1.4rem" }}>
          <span className="tag" title="The API is not connected; showing design fixtures.">
            fixture data
          </span>
        </p>
      )}

      {claims.length === 0 ? (
        <p style={{ color: "var(--muted)", fontFamily: "var(--sans)" }}>
          {filtersActive
            ? "No claims match these filters. Try widening the importance band or the assessment filter."
            : q
              ? "No claims match that search."
              : "No assessed claims yet."}
        </p>
      ) : (
        <div className="cards">
          {claims.map((c) => (
            <Link href={`/claims/${c.id}`} className="card" key={c.id}>
              <div className="card-claim">{c.text}</div>
              <div className="card-foot">
                {c.assessment_status ? <StatusBadge status={c.assessment_status} /> : <Unassessed />}
                <span className="tag kind">{CLAIM_TYPE_LABEL[c.claim_type] ?? c.claim_type?.replace(/_/g, " ")}</span>
                {c.state !== "active" && <span className="tag">{c.state.replace(/_/g, " ")}</span>}
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: ".6rem", alignItems: "center" }}>
                  <Importance value={c.importance} />
                  {/* Verdict confidence used to sit here as a bare number and
                      read as P(claim true); it now lives on the claim page,
                      quietly labelled (#160). Search relevance stays: it is
                      about the match, not the claim. */}
                  {typeof c.similarity_score === "number" && (
                    <span className="conf-num" title="search relevance">
                      {c.similarity_score.toFixed(2)}
                    </span>
                  )}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
