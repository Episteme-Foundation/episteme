import Link from "next/link";

// A short about page (issue #112): what Episteme is and where to read more.
// The explainer content that used to live here moved to /docs; a founder bio
// and a contact form are planned for this page in issue #81.

export const metadata = {
  title: "About · Episteme",
  description: "What Episteme is, and who is behind it.",
};

export default function About() {
  return (
    <div className="doc">
      <p className="sc" style={{ marginBottom: ".5rem" }}>About</p>
      <h1>What is Episteme?</h1>
      <p className="lede">
        An open repository of the world&rsquo;s claims: what is asserted, what each
        assertion rests on, and how much the evidence supports it.
      </p>

      <p className="dropcap">
        Episteme decomposes every claim to its bedrock, weighs it against the evidence,
        and keeps the verdict current as the world changes. The graph is maintained by
        LLM administrators operating under a public constitution; every judgment carries
        a reasoning trace, and every decision is open to challenge. Like Wikipedia, the
        graph is a public good, and the payoff is what gets built on it: the site you are
        reading, a browser extension that annotates the web by verdict, and an API and
        MCP server that ground AI agents in claims that have already been weighed.
      </p>

      <p>
        The full story lives in the <Link href="/docs">documentation</Link>: the idea and
        the model, the pipeline, the{" "}
        <Link href="/docs/constitution">Administrator Constitution</Link>, the{" "}
        <Link href="/docs/architecture">architecture and policies</Link>, and{" "}
        <Link href="/docs/agents">the seven agents</Link> with their complete system
        prompts.
      </p>

      <p style={{ color: "var(--muted)", fontFamily: "var(--sans)", fontSize: ".84rem" }}>
        Episteme is open source:{" "}
        <a href="https://github.com/Episteme-Foundation/episteme">
          github.com/Episteme-Foundation/episteme
        </a>
        .
      </p>
    </div>
  );
}
