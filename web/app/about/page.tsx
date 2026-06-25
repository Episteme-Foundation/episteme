import Link from "next/link";
import { DocLayout } from "@/components/DocLayout";

const toc = [
  { depth: 2, text: "The shape of the thing", slug: "the-shape-of-the-thing" },
  { depth: 2, text: "Read further", slug: "read-further" },
];

export default function About() {
  return (
    <DocLayout toc={toc}>
    <div className="doc">
      <p className="sc" style={{ marginBottom: ".5rem" }}>About</p>
      <h1>What is Episteme?</h1>
      <p className="lede">
        An attempt to build, for the open internet, a shared and inspectable map of claims —
        what is asserted, what each assertion rests on, and how much the evidence supports it.
      </p>

      <p className="dropcap">
        Wikipedia is valuable but limited to encyclopedic entries, and its editors must
        defer to secondary sources rather than weigh primary evidence directly. Most
        public disagreement, meanwhile, is confused: people believe they are arguing about
        facts when they are using different definitions, or believe they disagree about
        values when they actually disagree about empirical consequences. Episteme exists to
        make that structure visible — not to declare winners.
      </p>

      <p>
        The graph is maintained by LLM <em>administrators</em> operating under a public{" "}
        <Link href="/about/constitution">constitution</Link> and a set of operational{" "}
        <Link href="/about/architecture">policies</Link>. Where a Wikipedia administrator
        enforces human-written rules and cites secondary sources, a graph administrator
        exercises judgment guided by stated principles and can examine primary sources
        directly. Every judgment carries a reasoning trace; every decision is open to
        challenge.
      </p>

      <h2 id="the-shape-of-the-thing">The shape of the thing</h2>
      <ul>
        <li><strong>Claims</strong> — propositions that can be true or false, stored in a canonical form that makes their implicit parameters explicit.</li>
        <li><strong>Arguments</strong> — named, independent lines of reasoning bearing on a claim, each grouping its own subclaims.</li>
        <li><strong>Decomposition</strong> — typed edges (requires, supports, contradicts, specifies, defines, presupposes) linking a claim to the subclaims it rests on.</li>
        <li><strong>Assessment</strong> — one of six honest verdicts, with a confidence and a reasoning trace, revisable as the world changes.</li>
        <li><strong>Instances &amp; sources</strong> — the exact utterances of a claim across the internet, linked back to the canonical node.</li>
        <li><strong>Governance</strong> — contributions, reviews, appeals, and arbitration that let humans and agents improve the graph.</li>
      </ul>

      <h2 id="read-further">Read further</h2>
      <ul>
        <li><Link href="/about/constitution">The Administrator Constitution</Link> — the 25 principles that govern every agent, in full.</li>
        <li><Link href="/about/architecture">Architecture &amp; policies</Link> — the design of the graph and the operational rules.</li>
        <li><Link href="/about/agents">The agents</Link> — the seven LLM administrators that do the work, each shown with its complete system prompt.</li>
      </ul>
    </div>
    </DocLayout>
  );
}
