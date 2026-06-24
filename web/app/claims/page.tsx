import Link from "next/link";
import { loadClaims } from "@/lib/data";
import { CLAIM_TYPE_LABEL, IMPORTANCE_FLOORS, importanceFloorMin } from "@/lib/ontology";
import type { ImportanceFloor } from "@/lib/ontology";
import { StatusBadge, Unassessed, Importance } from "@/components/Assessment";
import type { AssessedFilter } from "@/lib/types";

const ASSESSED_OPTIONS: { value: AssessedFilter; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "assessed", label: "Assessed only" },
  { value: "unassessed", label: "Unassessed only" },
];

export default async function ClaimsIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; assessed?: string; imp?: string }>;
}) {
  const { q, assessed: assessedRaw, imp: impRaw } = await searchParams;

  // Normalise the URL params back into known values (and the selected options).
  const assessed: AssessedFilter =
    assessedRaw === "assessed" || assessedRaw === "unassessed" ? assessedRaw : "all";
  const impFloor: ImportanceFloor = (IMPORTANCE_FLOORS.find((f) => f.value === impRaw)?.value ??
    "any") as ImportanceFloor;
  const minImportance = importanceFloorMin(impFloor);
  const filtersActive = assessed !== "all" || minImportance > 0;

  const { results: claims, source } = await loadClaims(q, { assessed, minImportance });

  const inputStyle = {
    font: "inherit", fontSize: ".92rem", padding: ".4rem .6rem",
    border: "1px solid var(--rule)", borderRadius: "4px",
    background: "var(--paper-card)", color: "var(--ink)",
  } as const;

  return (
    <div className="col-wide">
      <p className="sc" style={{ marginBottom: ".5rem" }}>Browse</p>
      <h1>Claims</h1>
      <p className="lede" style={{ fontSize: "1.05rem" }}>
        Search the graph by meaning. Each result carries its current verdict; open one to
        see its decomposition, provenance, and the reasoning behind the assessment.
      </p>

      <form action="/claims" style={{ margin: "1.4rem 0 2rem", maxWidth: "40rem" }}>
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search claims — e.g. “was inflation high in 2022?”"
          style={{
            width: "100%", font: "inherit", fontSize: "1rem", padding: ".6rem .8rem",
            border: "1px solid var(--rule)", borderRadius: "4px", background: "var(--paper-card)",
            color: "var(--ink)",
          }}
        />
        <div className="claim-filters">
          <label className="claim-filter">
            <span className="sc">Assessment</span>
            <select name="assessed" defaultValue={assessed} style={inputStyle}>
              {ASSESSED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="claim-filter">
            <span className="sc">Importance</span>
            <select name="imp" defaultValue={impFloor} style={inputStyle}>
              {IMPORTANCE_FLOORS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="claim-filter-apply" style={inputStyle}>Apply</button>
          {(filtersActive || q) && (
            <Link href="/claims" className="claim-filter-clear">Clear</Link>
          )}
        </div>
      </form>

      {source === "fixture" && (
        <p style={{ marginTop: "-1rem", marginBottom: "1.4rem" }}>
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
              : "No claims yet."}
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
                  {typeof c.assessment_confidence === "number" ? (
                    <span className="conf-num" title="assessment confidence">
                      {c.assessment_confidence.toFixed(2)}
                    </span>
                  ) : typeof c.similarity_score === "number" ? (
                    <span className="conf-num" title="search relevance">
                      {c.similarity_score.toFixed(2)}
                    </span>
                  ) : null}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
