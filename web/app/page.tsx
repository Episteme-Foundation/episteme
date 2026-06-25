import Link from "next/link";
import { FLAGSHIP_ID } from "@/lib/fixtures";
import { DecompositionFigure } from "./DecompositionFigure";

export default function Home() {
  return (
    <div>
      <section className="col-wide">
        <p className="sc" style={{ marginBottom: ".6rem" }}>An open repository of claims</p>
        <h1 style={{ fontSize: "2.4rem", maxWidth: "32rem" }}>
          The same claims, investigated over and over.
        </h1>
        <p className="lede">
          Across the internet the same claims and subclaims get investigated over and
          over, and the reasoning is thrown out the moment a session ends. Episteme does
          that work once. It is an open repository of the world’s claims overseen by an
          LLM-based bureaucracy. Picture Wikipedia, if its editors were AI administrators
          bound by a constitution and its pages were not topics but individual claims,
          each one weighed against the evidence and kept current as the world changes.
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

      {/* Decomposition, the central method */}
      <section className="prose">
        <h2>Decomposition is the method</h2>
        <p className="dropcap">
          The atomic unit is the claim, a proposition that can be true or false. A
          normative claim like “we should raise the minimum wage” counts no less than an
          empirical one, and two formulations are the same claim exactly when they
          decompose the same way. Claims decompose into subclaims. “Inflation was high”
          becomes “US CPI inflation in 2022 exceeded [threshold],” which depends on a
          verified fact (the Bureau of Labor Statistics reported 6.5%) and a contested
          definition (what counts as “high”). Follow a claim down to its bedrock and you
          find exactly where a disagreement actually lives.
        </p>
        <p>
          A claim can rest on several distinct <em>arguments</em>, independent lines of
          reasoning that each group their own subclaims. “God is real” carries the
          cosmological argument for and the argument from evil against, among others.
          Episteme keeps these side by side rather than collapsing them into one verdict.
          A claim and its denial are one and the same node, and the disagreement belongs
          on the claim itself.
        </p>
        <DecompositionFigure />
        <p><Link href={`/claims/${FLAGSHIP_ID}`}>Walk through the inflation example →</Link></p>
      </section>

      <hr className="thin" />

      {/* The pipeline */}
      <section className="col-wide">
        <h2>How a claim enters the graph</h2>
        <p className="prose" style={{ marginBottom: 0 }}>
          Claims are processed deliberately by dedicated LLM administrators, not generated
          ad hoc in response to a query. A source is read for the claims it asserts. Each
          is matched against what already exists in the graph. Then the claim’s own
          steward takes over.
        </p>
        <div className="pipeline">
          {[
            ["01", "Extractor", "reads a source for the claims it asserts, in canonical form"],
            ["02", "Matcher", "same claim, or new? two claims match when they decompose alike, and a claim and its negation count as one"],
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
          Around them sits a governance layer. A curator tends the structure between
          claims, a contribution reviewer weighs public submissions, a dispute arbitrator
          handles escalations, and an auditor checks the work. Together they keep the graph
          honest as evidence and argument accumulate.
          <Link href="/about/agents"> Meet the agents, with their full system prompts →</Link>
        </p>
      </section>

      <hr className="thin" />

      {/* What it is for */}
      <section className="prose">
        <h2>Built to be built on</h2>
        <p>
          Like Wikipedia, the claim graph is a public good, and the payoff is what gets
          built on top of it. The website is one surface, where you can read a claim and
          follow its arguments out to the claims and sources beneath it. Contributions
          arrive the same way, through an open protocol, and are handled by rules that
          develop over time into something like precedent and common law.
        </p>
        <p>
          The same graph can be served over MCP as grounding for AI agents, more efficient
          and more accurate than sending each agent back out to re-research what the graph
          has already settled. And the same decomposition that builds the graph can drive a
          browser extension that checks claims against it live, as you read.
        </p>
        <p style={{ fontSize: ".88rem", color: "var(--muted)" }}>
          None of this is a moonshot. A frontier-quality compilation of the world’s claims
          runs to high single-digit millions of dollars of inference, because the hard work
          of decomposing a claim is done once and then applies everywhere that claim
          appears.
        </p>
      </section>

      <hr className="thin" />

      {/* Neutrality without nihilism, and the close */}
      <section className="prose">
        <h2>Neutral, not nihilist</h2>
        <p>
          Episteme weighs evidence and reaches verdicts. What it will not do is write down a
          prior for every question, least of all the normative ones, and call that the
          answer. It organizes the evidence and the arguments so that genuinely open
          questions stay legible as open. The university is the home and sponsor of critics;
          it is not itself the critic.
        </p>
        <p style={{ color: "var(--ink-soft)" }}>
          The owl of Minerva spreads its wings only with the falling of the dusk. Episteme
          aims to change that. With LLMs maintaining the world’s claims, we can understand
          them as they are made, and not only in retrospect.
        </p>
      </section>
    </div>
  );
}
