import type { ReactNode } from "react";
import type { TocItem } from "@/lib/toc";
import { DocToc } from "./DocToc";

// Two-column reading layout for long verbatim documents: the text column on the
// left at the usual measure, and a right rail holding an optional aside plus a
// sticky table of contents. Collapses to a single column on narrow screens.
export function DocLayout({
  toc,
  aside,
  tocTitle,
  children,
}: {
  toc: TocItem[];
  aside?: ReactNode;
  tocTitle?: string;
  children: ReactNode;
}) {
  // The rail is first in the DOM so it stacks above the content on narrow
  // screens; on desktop the grid pins each to its own column, so order is moot.
  return (
    <div className="doc-layout">
      <div className="doc-rail">
        {aside}
        {toc.length > 0 && <DocToc items={toc} title={tocTitle} />}
      </div>
      <div className="doc-col">{children}</div>
    </div>
  );
}
