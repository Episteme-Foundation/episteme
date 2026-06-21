import Link from "next/link";
import { loadClaims } from "@/lib/data";
import { CLAIM_TYPE_LABEL } from "@/lib/ontology";
import { StatusBadge } from "@/components/Assessment";

export default async function ClaimsIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { results: claims, source } = await loadClaims(q);
  return (
    <div className="col-wide">
      <p className="sc" style={{ marginBottom: ".5rem" }}>Browse</p>
      <h1>Claims</h1>
      <p className="lede" style={{ fontSize: "1.05rem" }}>
        Search the graph by meaning. Each result carries its current verdict; open one to
        see its decomposition, provenance, and the reasoning behind the assessment.
      </p>

      <form action="/claims" style={{ margin: "1.4rem 0 2rem", maxWidth: "34rem" }}>
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
      </form>

      {source === "fixture" && (
        <p style={{ marginTop: "-1rem", marginBottom: "1.4rem" }}>
          <span className="tag" title="The API is not connected; showing design fixtures.">
            fixture data
          </span>
        </p>
      )}

      <div className="cards">
        {claims.map((c) => (
          <Link href={`/claims/${c.id}`} className="card" key={c.id}>
            <div className="card-claim">{c.text}</div>
            <div className="card-foot">
              {c.assessment_status && <StatusBadge status={c.assessment_status} />}
              <span className="tag kind">{CLAIM_TYPE_LABEL[c.claim_type]}</span>
              {c.state !== "active" && <span className="tag">{c.state.replace(/_/g, " ")}</span>}
              {typeof c.similarity_score === "number" && (
                <span className="conf-num" style={{ marginLeft: "auto" }} title="search relevance">
                  {c.similarity_score.toFixed(2)}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
