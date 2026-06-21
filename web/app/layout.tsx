import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Episteme — the epistemic graph",
  description:
    "A knowledge graph of claims with transparent provenance, decomposition, and validity assessment.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="masthead">
          <div className="masthead-inner">
            <Link href="/" className="wordmark plain">
              <span className="glyph" aria-hidden>◆</span>Episteme
            </Link>
            <nav>
              <Link href="/claims">claims</Link>
              <Link href="/about">about</Link>
              <Link href="/about/constitution">constitution</Link>
              <Link href="/about/architecture">architecture</Link>
              <Link href="/about/agents">agents</Link>
            </nav>
          </div>
        </header>
        <main className="frame">{children}</main>
        <footer className="site">
          <div className="inner">
            Episteme is infrastructure for thought — a shared map of claims, evidence, and
            argument, maintained by LLM administrators under a public constitution.
            Assessments are based on evidence and reasoning, open to inspection and correction.
          </div>
        </footer>
      </body>
    </html>
  );
}
