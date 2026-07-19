"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { TreeNode } from "@/lib/types";
import {
  RELATION, statusMeta, STANCE_LABEL, argumentVerdictMeta,
  decompositionEffects, effectCounts, groupByArgument, EFFECT, EFFECT_ORDER,
  DEFINED_IN, type ScoredNode, type ArgumentGroup,
} from "@/lib/ontology";
import { buildClaimTextMap, hasClaimLinks } from "@/lib/claim-links";
import { ArgumentText } from "@/components/ArgumentText";
import { Term } from "@/components/Term";
import styles from "./margins.module.css";

// Scrollspy over the reading column (issue #202). DecompositionTree tags every
// rendered node with data-claim-node; we watch which of those spans a "reading
// line" near the top of the viewport and report the deepest one, so the outline
// can follow the reading position. Null until the reader reaches the tree.
function useActiveNodeId(enabled: boolean): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const tree = document.querySelector(".tree");
    if (!tree) return;

    const intersecting = new Set<Element>();
    const pick = () => {
      let best: Element | null = null;
      for (const el of intersecting) {
        // A node's wrapper contains its children, so descendants (and later
        // siblings) both report FOLLOWING: the last in document order is the
        // most specific node under the reading line.
        if (!best || best.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = el;
      }
      // Between nodes (argument prose, section gaps) keep the previous active.
      if (best) setActive(best.getAttribute("data-claim-node"));
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) intersecting.add(e.target);
          else intersecting.delete(e.target);
        }
        pick();
      },
      // a zero-height reading line 28% down the viewport
      { rootMargin: "-28% 0px -72% 0px" },
    );
    const observeAll = () => {
      io.disconnect();
      intersecting.clear();
      tree.querySelectorAll("[data-claim-node]").forEach((el) => io.observe(el));
    };
    observeAll();
    // expanding or collapsing tree nodes changes which nodes exist to observe
    const mo = new MutationObserver(observeAll);
    mo.observe(tree, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [enabled]);
  return active;
}

// One subclaim line in the revealed outline.
function OutlineNode({ scored, active }: { scored: ScoredNode; active: boolean }) {
  const { node, effect } = scored;
  const rel = node.relation_type ? RELATION[node.relation_type] : null;
  const own = statusMeta(node.assessment_status).label;
  return (
    <li
      className={`${styles.outlineItem}${active ? ` ${styles.outlineItemActive}` : ""}`}
      data-spy-node={node.id}
      style={{ paddingLeft: `${Math.max(0, node.depth - 1) * 0.7}rem` }}
    >
      <span
        className={`swatch ${EFFECT[effect].cls}`}
        title={`${EFFECT[effect].label} — ${own} subclaim, ${EFFECT[effect].gloss}`}
        aria-hidden
      />
      <Link href={`/claims/${node.id}`} className={styles.outlineText} title={node.text}>
        {rel && <span className={`relation ${rel.cls} ${styles.outlineRel}`}>{rel.label}</span>}
        {node.text}
      </Link>
    </li>
  );
}

// A collapsible argument group, coloured by its NET effect on the main claim.
function ArgumentBlock({
  group, spyKey, defaultOpen, texts, activeId,
}: {
  group: ArgumentGroup; spyKey: string; defaultOpen: boolean;
  texts: Map<string, string>; activeId: string | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const present = EFFECT_ORDER.filter((e) => group.counts[e] > 0);
  const n = group.nodes.length;
  // Scrollspy (issue #202): mark the group the reader is currently inside, so
  // it stays findable even when the group itself is collapsed.
  const active = activeId !== null && group.nodes.some((s) => s.node.id === activeId);
  // The written form: how these subclaims combine to bear on the claim, with
  // the subclaims linked inline. Label-only legacy content is skipped.
  const written = group.content && hasClaimLinks(group.content) ? group.content : null;
  // The steward's evaluation of the inference (issue #173); null until judged.
  const verdict = argumentVerdictMeta(group.verdict);
  return (
    <li className={styles.argGroup} data-spy-group={spyKey}>
      <button
        type="button"
        className={`${styles.argHead}${active ? ` ${styles.argHeadActive}` : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.argCaret}>{open ? "▾" : "▸"}</span>
        <span
          className={`swatch ${EFFECT[group.net].cls}`}
          title={`on balance ${EFFECT[group.net].label} — ${EFFECT[group.net].gloss}`}
          aria-hidden
        />
        <span className={styles.argName}>{group.name}</span>
        {group.stance && <span className={`arg-stance ${group.stance}`}>{STANCE_LABEL[group.stance]}</span>}
        {verdict && <span className={`arg-verdict ${verdict.cls}`} title={verdict.gloss}>{verdict.label}</span>}
        <span className={styles.argCount}>{n}</span>
      </button>
      {open && (
        <>
          {written && (
            <p className={styles.argProse}>
              <ArgumentText content={written} texts={texts} />
            </p>
          )}
          {group.evaluation && (
            <p className={styles.argEval}>
              <ArgumentText content={group.evaluation} texts={texts} />
            </p>
          )}
          <div className={styles.argBar} title="effect of this argument's subclaims on the claim" aria-hidden>
            {present.map((e) => (
              <span key={e} className={EFFECT[e].cls} style={{ width: `${(group.counts[e] / n) * 100}%` }} />
            ))}
          </div>
          <ol className={styles.argNodes}>
            {group.nodes.map((s) => (
              <OutlineNode key={s.node.id} scored={s} active={s.node.id === activeId} />
            ))}
          </ol>
        </>
      )}
    </li>
  );
}

// The decomposition "compass" that lives in the left margin: an ambient status
// distribution (by effect on the claim, not raw subclaim status) that expands on
// demand into an argument-grouped outline.
export function DecompositionCompass({ tree }: { tree: TreeNode }) {
  const [open, setOpen] = useState(false);
  const scored = decompositionEffects(tree);
  const counts = effectCounts(scored);
  const total = scored.length;
  const present = EFFECT_ORDER.filter((e) => counts[e] > 0);
  const groups = groupByArgument(scored);

  // Scrollspy (issue #202): while the outline is open, follow the reading
  // position in the centre column and keep the active entry visible inside the
  // outline's own scrollbox — otherwise a tall decomposition clips its tail and
  // the reader never learns it is there.
  const activeId = useActiveNodeId(open && total > 0);
  const activeGroupIdx =
    activeId === null ? -1 : groups.findIndex((g) => g.nodes.some((s) => s.node.id === activeId));
  const activeGroupKey = activeGroupIdx < 0 ? null : groups[activeGroupIdx].id ?? `g${activeGroupIdx}`;
  const boxRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || activeId === null) return;
    const node = CSS.escape(activeId);
    // Prefer the node inside the active group (a shared subclaim can appear in
    // several); fall back to the group head when the group is collapsed.
    const target =
      (activeGroupKey &&
        box.querySelector(`[data-spy-group="${CSS.escape(activeGroupKey)}"] [data-spy-node="${node}"]`)) ||
      box.querySelector(`[data-spy-node="${node}"]`) ||
      (activeGroupKey && box.querySelector(`[data-spy-group="${CSS.escape(activeGroupKey)}"]`));
    if (!target) return;
    // Scroll only the outline's scrollbox, never the page.
    const bt = box.getBoundingClientRect();
    const tt = target.getBoundingClientRect();
    if (tt.top < bt.top) box.scrollTop += tt.top - bt.top;
    else if (tt.bottom > bt.bottom) box.scrollTop += tt.bottom - bt.bottom;
  }, [activeId, activeGroupKey, open]);

  // Atomic claim: nothing to summarise. Show a quiet resting note, no bar.
  if (total === 0) {
    return (
      <aside className={styles.rail} aria-label="Decomposition">
        <div className={styles.railHead} style={{ cursor: "default" }}>
          <span className="sc">Decomposition</span>
          <span className={styles.railCount}>
            0<span className={styles.railCountUnit}>subclaims</span>
          </span>
        </div>
        <p className={styles.emptyNote}>
          Atomic — this claim bottoms out in a bedrock fact, a contested question,
          or a value premise, and does not decompose further.
        </p>
      </aside>
    );
  }

  const texts = buildClaimTextMap(tree);
  // The argument primitive is optional: only group when an argument is actually
  // named. Otherwise the outline is a flat list. When there are many arguments,
  // don't open them all at once — keep the first open as a hint, collapse the rest.
  const grouped = groups.some((g) => g.named);
  const openAll = groups.length <= 3;

  return (
    <aside className={styles.rail} aria-label="Decomposition compass">
      <button type="button" className={styles.railHead} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="sc">Decomposition</span>
        <span className={styles.railCount}>
          {total}
          <span className={styles.railCountUnit}>subclaim{total === 1 ? "" : "s"}</span>
        </span>
      </button>

      {/* the compass: how the body of subclaims bears on THIS claim */}
      <div className={styles.distBar} title="how the subclaims bear on this claim" aria-hidden>
        {present.map((e) => (
          <span key={e} className={EFFECT[e].cls} style={{ width: `${(counts[e] / total) * 100}%` }} />
        ))}
      </div>
      <ul className={styles.legend}>
        {present.map((e) => (
          <li key={e} className={EFFECT[e].cls}>
            <span className={`swatch ${EFFECT[e].cls}`} aria-hidden />
            <span className={styles.legendN}>{counts[e]}</span>
            <Term gloss={EFFECT[e].gloss} href={DEFINED_IN.effect} className={styles.legendLbl} align="start">
              {EFFECT[e].label}
            </Term>
          </li>
        ))}
      </ul>
      <p className={styles.compassNote}>by effect on this claim, not by subclaim status</p>

      <button type="button" className={styles.railToggle} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open
          ? "▾ hide outline"
          : `▸ outline (${grouped ? `${groups.length} argument${groups.length === 1 ? "" : "s"}` : total})`}
      </button>

      {open &&
        (grouped ? (
          <ul className={styles.argList} ref={(el) => { boxRef.current = el; }}>
            {groups.map((g, i) => (
              <ArgumentBlock
                key={g.id ?? `g${i}`}
                spyKey={g.id ?? `g${i}`}
                group={g}
                defaultOpen={openAll || i === 0}
                texts={texts}
                activeId={activeId}
              />
            ))}
          </ul>
        ) : (
          <ol className={styles.outline} ref={(el) => { boxRef.current = el; }}>
            {scored.map((s) => (
              <OutlineNode key={s.node.id} scored={s} active={s.node.id === activeId} />
            ))}
          </ol>
        ))}
    </aside>
  );
}
