import Link from "next/link";
import { STATUS, STATUS_ORDER } from "@/lib/ontology";
import { FLAGSHIP_ID } from "@/lib/fixtures";

export default function Home() {
  return (
    <div>
      <section className="col-wide">
        <p className="sc" style={{ marginBottom: ".6rem" }}>The epistemic graph</p>
        <h1 style={{ fontSize: "2.4rem", maxWidth: "30rem" }}>
          A map of what we claim, what it rests on, and how much to believe it.
        </h1>
        <p className="lede">
          Episteme builds and maintains a knowledge graph of <em>claims</em> — propositions
          that can be true or false — with transparent provenance, decomposition into
          subclaims, and an honest assessment of validity. It does not tell you what to
          think. It makes visible the <em>structure</em> of what is being claimed and where
          the real disagreements lie.
        </p>
        <p style={{ maxWidth: "34rem" }}>
          <Link href={`/claims/${FLAGSHIP_ID}`}>See a worked claim →</Link>
          <span style={{ color: "var(--faint)" }}> · </span>
          <Link href="/claims">Browse the graph</Link>
          <span style={{ color: "var(--faint)" }}> · </span>
          <Link href="/about">What is Episteme?</Link>
        </p>
      </section>

      <hr className="thin" />

      {/* The vocabulary of assessment */}
      <section className="prose">
        <h2>Six honest verdicts</h2>
        <p>
          Most of the world's claims cannot — and should not — be flattened to
          true/false. Episteme assigns one of six statuses, and refuses to round an
          uncertain claim up to “verified” or down to “false.”
        </p>
        <div className="cards" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {STATUS_ORDER.map((s) => (
            <div className="card" key={s} style={{ display: "flex", gap: ".7rem", alignItems: "flex-start" }}>
              <span className={`badge ${STATUS[s].cls}`} style={{ flex: "none" }}>
                <span className="badge-glyph" aria-hidden>{STATUS[s].glyph}</span>
                {STATUS[s].label}
              </span>
              <span style={{ fontSize: ".88rem", color: "var(--ink-soft)" }}>{STATUS[s].def}</span>
            </div>
          ))}
        </div>
      </section>

      <hr className="thin" />

      {/* Decomposition, the central method */}
      <section className="prose">
        <h2>Decomposition is the method</h2>
        <p className="dropcap">
          Claims decompose into subclaims. “Inflation was high” becomes “US CPI inflation
          in 2022 exceeded [threshold],” which depends on a <em>verified</em> fact (the
          Bureau of Labor Statistics reported 6.5%) and a <em>contested</em> definition
          (what counts as “high”). Following a claim down to its bedrock — uncontested
          facts, genuinely open empirical questions, or fundamental value premises —
          reveals exactly where a disagreement actually lives.
        </p>
        <p>
          A claim may rest on several distinct <em>arguments</em>: independent lines of
          reasoning, each grouping its own subclaims. “God is real” carries the
          cosmological, teleological, and ontological arguments for, and the problem of
          evil against. Episteme keeps them side by side rather than collapsing them.
        </p>
        <p><Link href={`/claims/${FLAGSHIP_ID}`}>Walk through the inflation example →</Link></p>
      </section>

      <hr className="thin" />

      {/* The pipeline */}
      <section className="col-wide">
        <h2>How a claim enters the graph</h2>
        <p className="prose" style={{ marginBottom: 0 }}>
          Claims are processed deliberately by dedicated LLM administrators — a source is
          read for the claims it asserts, each is matched against what already exists, and
          the claim&apos;s owner then decomposes and assesses it — not generated ad-hoc in
          response to a query.
        </p>
        <div className="pipeline">
          {[
            ["01", "Extractor", "reads a source for the claims it asserts, in canonical form"],
            ["02", "Matcher", "same claim, or new? two claims match iff they decompose alike — and a claim and its negation are one"],
            ["03", "Claim Steward", "owns each claim: decomposes it into subclaims and arguments, then weighs the evidence into one of six verdicts"],
          ].map(([n, name, desc]) => (
            <div className="stage" key={n}>
              <span className="sc">{n}</span>
              <div className="stage-name">{name}</div>
              <div className="stage-desc">{desc}</div>
            </div>
          ))}
        </div>
        <p className="prose" style={{ fontSize: ".88rem", color: "var(--muted)" }}>
          A governance layer — the claim steward, a curator that tends the structure
          between claims, the contribution reviewer, dispute arbitrator, and an auditor —
          handles challenges and keeps the graph honest over time.
          <Link href="/about/agents"> Meet the agents, with their full system prompts →</Link>
        </p>
      </section>
    </div>
  );
}
