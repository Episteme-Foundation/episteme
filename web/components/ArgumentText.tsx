import Link from "next/link";
import { parseWrittenForm } from "@/lib/claim-links";

/**
 * An argument's written form: brief prose in which [[claim:<id>]] references
 * become links to the subclaims the argument runs on. Authored inline phrasing
 * wins; otherwise the claim's canonical text (via `texts`, usually built from
 * the decomposition tree with buildClaimTextMap); otherwise a generic label.
 * Each link carries the ↗ open-claim affordance used in the tree and on the
 * map, marking the linked phrase as itself a claim with a page (issue #200).
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
      {parseWrittenForm(content).map((seg, i) => {
        if (seg.kind === "text") return <span key={i}>{seg.text}</span>;
        const canonical = texts?.get(seg.claimId);
        return (
          <Link
            key={i}
            href={`/claims/${seg.claimId}`}
            className="argform-link"
            title={canonical && seg.display ? canonical : "open this claim"}
          >
            {seg.display ?? canonical ?? "linked claim"}
            <span className="open-claim" aria-hidden="true">↗</span>
          </Link>
        );
      })}
    </>
  );
}
