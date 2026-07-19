"use client";

import { useState } from "react";
import Link from "next/link";
import type { TreeNode } from "@/lib/types";
import {
  RELATION, statusMeta, STANCE_LABEL, argumentVerdictMeta,
  decompositionEffects, effectCounts, groupByArgument, EFFECT, EFFECT_ORDER,
  type ScoredNode, type ArgumentGroup,
} from "@/lib/ontology";
import { buildClaimTextMap, hasClaimLinks } from "@/lib/claim-links";
import { ArgumentText } from "@/components/ArgumentText";
import styles from "./margins.module.css";

// One subclaim line in the revealed outline.
function OutlineNode({ scored }: { scored: ScoredNode }) {
  const { node, effect } = scored;
  const rel = node.relation_type ? RELATION[node.relation_type] : null;
  const own = statusMeta(node.assessment_status).label;
  return (
    <li className={styles.outlineItem} style={{ paddingLeft: `${Math.max(0, node.depth - 1) * 0.7}rem` }}>
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
  group, defaultOpen, texts,
}: { group: ArgumentGroup; defaultOpen: boolean; texts: Map<string, string> }) {
  const [open, setOpen] = useState(defaultOpen);
  const present = EFFECT_ORDER.filter((e) => group.counts[e] > 0);
  const n = group.nodes.length;
  // The written form: how these subclaims combine to bear on the claim, with
  // the subclaims linked inline. Label-only legacy content is skipped.
  const written = group.content && hasClaimLinks(group.content) ? group.content : null;
  // The steward's evaluation of the inference (issue #173); null until judged.
  const verdict = argumentVerdictMeta(group.verdict);
  return (
    <li className={styles.argGroup}>
      <button type="button" className={styles.argHead} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
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
            {group.nodes.map((s) => <OutlineNode key={s.node.id} scored={s} />)}
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

  const groups = groupByArgument(scored);
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
          <li key={e} className={EFFECT[e].cls} title={EFFECT[e].gloss}>
            <span className={`swatch ${EFFECT[e].cls}`} aria-hidden />
            <span className={styles.legendN}>{counts[e]}</span>
            <span className={styles.legendLbl}>{EFFECT[e].label}</span>
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
          <ul className={styles.argList}>
            {groups.map((g, i) => (
              <ArgumentBlock key={g.id ?? `g${i}`} group={g} defaultOpen={openAll || i === 0} texts={texts} />
            ))}
          </ul>
        ) : (
          <ol className={styles.outline}>
            {scored.map((s) => <OutlineNode key={s.node.id} scored={s} />)}
          </ol>
        ))}
    </aside>
  );
}
