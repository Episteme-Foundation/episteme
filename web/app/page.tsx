import Link from "next/link";
import { FLAGSHIP_ID } from "@/lib/fixtures";
import { loadClaim } from "@/lib/data";
import { Surfaces } from "@/components/home/Surfaces";
import styles from "@/components/home/home.module.css";

// The home page (issue #80): show the graph, don't describe it. Hero + search,
// the three-surface tabs (live claim map / extension demo / MCP & API), and a
// closing triptych into the documentation. Explanation lives on the docs pages;
// the triptych links into /docs (#112). A corpus-counters row was considered
// and cut:
// too early while the corpus is in flux and there is no stats endpoint to
// report real figures.

export default async function Home() {
  const { detail, source } = await loadClaim(FLAGSHIP_ID);

  return (
    <div>
      {/* hero: one line, one search box */}
      <div className={styles.hero}>
        <p className={`sc ${styles.eyebrow}`}>An open repository of claims</p>
        <h1 className={styles.heroTitle}>
          The same claims, investigated over and over. Episteme does that work once.
        </h1>
        <p className={styles.heroLede}>
          Every claim decomposed to its bedrock, weighed against the evidence, and kept
          current as the world changes, by AI administrators bound by a public
          constitution.
        </p>
        <form className={styles.search} role="search" action="/claims" method="get">
          <input
            type="search"
            name="q"
            placeholder="Search the claim graph: try “inflation” or “minimum wage”"
            aria-label="Search the claim graph"
          />
        </form>
      </div>

      {/* what's built on the graph: 01 map · 02 extension · 03 MCP & API */}
      <Surfaces detail={detail} source={source} />

      {/* how it works: the docs triptych closes the page */}
      <section className={styles.section}>
        <h2>How Episteme works</h2>
        <p style={{ color: "var(--muted)", fontFamily: "var(--sans)", fontSize: ".92rem", maxWidth: "40rem", marginTop: ".4rem" }}>
          The graph is maintained by seven LLM administrators. Every decision carries a
          reasoning trace, and every trace is open to challenge.
        </p>
        <div className={styles.triptych}>
          <Link className={styles.panelLink} href="/docs/constitution">
            <span className="sc">The constitution</span>
            <h3>The principles that bind every agent</h3>
            <p>
              Twenty-five articles governing evidence, neutrality, decomposition, and
              appeal, published in full.
            </p>
            <span className={styles.go}>Read the constitution →</span>
          </Link>
          <Link className={styles.panelLink} href="/docs/architecture">
            <span className="sc">The architecture</span>
            <h3>How the graph is built and governed</h3>
            <p>
              Claims, arguments, and typed edges; the six verdicts; the pipeline from
              source to assessment; the operating policies.
            </p>
            <span className={styles.go}>Read the architecture →</span>
          </Link>
          <Link className={styles.panelLink} href="/docs/agents">
            <span className="sc">The agents</span>
            <h3>Seven administrators, in the open</h3>
            <p>
              Extractor, matcher, steward, curator, reviewer, arbitrator, auditor, each
              with its complete system prompt.
            </p>
            <span className={styles.go}>Meet the agents →</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
