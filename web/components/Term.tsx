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
//
// `linkTo` is for terms that sit inside a larger click target (a claim card,
// a list row): instead of pinning the popover on click, the label becomes a
// link to that destination so a click opens the claim like the rest of the card
// (#247). Hover/focus still reveals the definition. Standalone terms (claim-page
// header, legends) omit `linkTo` and keep click-to-pin so touch and keyboard
// users can still open the popover.
export function Term({
  gloss, href, source = "constitution", className, align = "center", ariaLabel, linkTo, children,
}: {
  gloss: string;
  href?: string;
  source?: string;
  className?: string;
  align?: "center" | "start" | "end";
  ariaLabel?: string;
  linkTo?: string;
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
  const labelCls = `term-label${className ? ` ${className}` : ""}`;

  return (
    <span className={`term${pinned ? " pinned" : ""}`} ref={ref}>
      {linkTo ? (
        <Link href={linkTo} className={`${labelCls} term-open`} aria-label={ariaLabel}>
          {children}
        </Link>
      ) : (
        <span
          role="button"
          tabIndex={0}
          aria-expanded={pinned}
          aria-label={ariaLabel}
          className={labelCls}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") toggle(e);
          }}
        >
          {children}
        </span>
      )}
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
