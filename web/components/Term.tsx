"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

// A piece of ontology vocabulary (a status, relation, claim type, importance
// band …) rendered as a clickable term (#198): hover or focus shows its
// definition instantly, click pins the popover, and the popover carries a link
// to the section of the constitution (or agent instructions) that defines the
// word. Unlike `.tip`, the popover is itself hoverable so the link is
// reachable; click-to-pin covers touch and keyboard.
//
// `className` styles the visible label (e.g. "tag kind", "badge st-verified").
// `align` shifts the popover for labels near a viewport edge: "start" pins its
// left edge to the label (left margin rail), "end" its right edge (right rail).
export function Term({
  gloss, href, source = "constitution", className, align = "center", ariaLabel, children,
}: {
  gloss: string;
  href?: string;
  source?: string;
  className?: string;
  align?: "center" | "start" | "end";
  ariaLabel?: string;
  children: ReactNode;
}) {
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  // Some Terms sit inside larger click targets (cards, tree rows); stop the
  // toggle from also triggering those.
  const toggle = (e: { preventDefault(): void; stopPropagation(): void }) => {
    e.preventDefault();
    e.stopPropagation();
    setPinned((v) => !v);
  };

  const popCls =
    align === "center" ? "term-pop" : `term-pop pop-${align}`;

  return (
    <span className={`term${pinned ? " pinned" : ""}`} ref={ref}>
      <span
        role="button"
        tabIndex={0}
        aria-expanded={pinned}
        aria-label={ariaLabel}
        className={`term-label${className ? ` ${className}` : ""}`}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") toggle(e);
        }}
      >
        {children}
      </span>
      <span className={popCls} role="note" onClick={(e) => e.stopPropagation()}>
        {gloss}
        {href && (
          <Link href={href} className="term-src">
            {source} →
          </Link>
        )}
      </span>
    </span>
  );
}
