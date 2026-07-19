import Link from "next/link";
import { parseProse } from "@/lib/claim-links";

/**
 * The graph's inline prose conventions, rendered: [[claim:<id>]] references
 * become links to the claims they name, and bare source URLs become external
 * links (issue #203). For a claim link, authored inline phrasing wins;
 * otherwise the claim's canonical text (via `texts`, usually built from the
 * decomposition tree with buildClaimTextMap); otherwise a generic label.
 * Serves argument written forms and evaluations (#129/#173) and assessment
 * prose (#203) alike.
 */
export function ArgumentText({
  content,
  texts,
}: {
  content: string;
  texts?: Map<string, string>;
}) {
  return (
    <>
      {parseProse(content).map((seg, i) => {
        if (seg.kind === "text") return <span key={i}>{seg.text}</span>;
        if (seg.kind === "url") {
          return (
            <a key={i} href={seg.href} className="prose-url" rel="nofollow noopener">
              {seg.href.replace(/^https?:\/\//, "")}
            </a>
          );
        }
        const canonical = texts?.get(seg.claimId);
        return (
          <Link
            key={i}
            href={`/claims/${seg.claimId}`}
            className="argform-link"
            title={canonical && seg.display ? canonical : "open this claim"}
          >
            {seg.display ?? canonical ?? "linked claim"}
          </Link>
        );
      })}
    </>
  );
}
