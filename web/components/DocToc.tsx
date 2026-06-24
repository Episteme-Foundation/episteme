"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/toc";

// A table of contents for a long verbatim document. Lives in the right margin
// (sticky on desktop, inline on mobile) and highlights the section currently in
// view via an IntersectionObserver scrollspy.
export function DocToc({ items, title = "On this page" }: { items: TocItem[]; title?: string }) {
  const [active, setActive] = useState<string>("");
  // The contents are open by default (the desktop rail and the no-JS case), but
  // on narrow screens they would push the document's own heading below the fold,
  // so we collapse them there into a tap-to-expand disclosure.
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1000px)");
    setOpen(!mq.matches);
    const onChange = (e: MediaQueryListEvent) => setOpen(!e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const headings = items
      .map((i) => document.getElementById(i.slug))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    // Track which headings are within the "reading band" near the top of the
    // viewport; the topmost one wins.
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const firstVisible = items.find((i) => visible.has(i.slug));
        if (firstVisible) setActive(firstVisible.slug);
      },
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 }
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="toc" aria-label="Table of contents">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="sc toc-title">{title}</summary>
        <ul>
          {items.map((item) => (
            <li
              key={item.slug}
              className={`toc-item d${item.depth}${active === item.slug ? " active" : ""}`}
            >
              <a href={`#${item.slug}`}>{item.text}</a>
            </li>
          ))}
        </ul>
      </details>
    </nav>
  );
}
