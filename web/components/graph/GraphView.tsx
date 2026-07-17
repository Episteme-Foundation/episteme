"use client";

import Link from "next/link";
import {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import type {
  AssessmentStatus, ClaimDetail, ClaimType, RelationType, TreeNode,
} from "@/lib/types";
import type { DataSource } from "@/lib/data";
import {
  CLAIM_TYPE_LABEL, RELATION, STATUS, STATUS_ORDER,
  decompositionNote, importanceLevel, IMPORTANCE, statusMeta,
  VERDICT_CONFIDENCE_GLOSS,
} from "@/lib/ontology";
import { buildClaimTextMap } from "@/lib/claim-links";
import { ArgumentText } from "@/components/ArgumentText";
import {
  BEDROCK, bedrockOf, computeLayout, defaultExpanded,
  type ClaimBits, type LEdge, type LNode, type Layout,
} from "./layout";
import styles from "./graph.module.css";

// ---------------------------------------------------------------------------
// The claim map (issue #79): a navigable focus+context view of one claim's
// neighbourhood — dependents above, decomposition below, down to bedrock.
// Clicking any claim recentres the map on it; the map at /claims/:id/map and
// the page at /claims/:id are two views of the same address. Orientation
// happens here; investigation happens on the page.
// ---------------------------------------------------------------------------

// Client-side cache of claim details, keyed by id. Recentring onto a claim the
// user has already visited (or arrived from) is instant; everything else is one
// BFF fetch. Module-level so it survives route transitions within the session.
const CACHE = new Map<string, ClaimDetail>();
const INFLIGHT = new Map<string, Promise<ClaimDetail | null>>();

async function fetchDetail(id: string): Promise<ClaimDetail | null> {
  const cached = CACHE.get(id);
  if (cached) return cached;
  const running = INFLIGHT.get(id);
  if (running) return running;
  const p = fetch(`/api/claims/${encodeURIComponent(id)}`)
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json()) as { detail: ClaimDetail };
      CACHE.set(id, body.detail);
      return body.detail;
    })
    .catch(() => null)
    .finally(() => INFLIGHT.delete(id));
  INFLIGHT.set(id, p);
  return p;
}

// Optimistic detail for a claim we only know as a node of the current view:
// enough to recentre instantly (the subtree carries structure when we have it);
// the real fetch fills in dependents, arguments and importance.
function partialFrom(bits: ClaimBits, node?: TreeNode): ClaimDetail {
  return {
    claim: {
      id: bits.id,
      text: bits.text,
      claim_type: bits.claimType ?? "empirical_derived",
      state: "active",
      decomposition_status: "pending",
      importance: 0.5,
      created_by: "",
      created_at: "",
      updated_at: "",
    },
    assessment: bits.status
      ? {
          id: "", status: bits.status, confidence: bits.confidence ?? 0,
          summary: "", reasoning_trace: "", subclaim_summary: {}, assessed_at: "",
        }
      : null,
    subclaim_count: node?.children.length ?? 0,
    tree: node,
    dependents: undefined, // unknown until the fetch lands
    arguments: undefined,
  };
}

function findInTree(root: TreeNode | undefined, id: string): TreeNode | null {
  if (!root) return null;
  if (root.id === id) return root;
  for (const c of root.children) {
    const hit = findInTree(c, id);
    if (hit) return hit;
  }
  return null;
}

interface View { detail: ClaimDetail; partial: boolean }

interface PreviewState {
  kind: "claim" | "pill";
  claim?: ClaimBits;
  isFocus?: boolean;
  pill?: { name: string; stance: string; desc: string | null };
}

function statusVars(status: AssessmentStatus | null): React.CSSProperties {
  const s = status ?? "unknown";
  return {
    color: `var(--st-${s})`,
    background: `var(--st-${s}-tint)`,
    borderColor: `var(--st-${s})`,
  };
}

function edgePath(e: LEdge, ox: number, oy: number): string {
  const x1 = e.x1 - ox, y1 = e.y1 - oy, x2 = e.x2 - ox, y2 = e.y2 - oy;
  if (e.horiz) {
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  }
  const dy = (y2 - y1) * 0.5;
  return `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
}

const BED_CLS: Record<string, string> = {
  fact: styles.bedFact, open: styles.bedOpen, value: styles.bedValue,
};

function Glyph({ status, size }: { status: AssessmentStatus | null; size?: string }) {
  const meta = statusMeta(status);
  return (
    <span
      className={styles.glyph}
      style={{ color: `var(--st-${status ?? "unknown"})`, fontSize: size }}
      aria-hidden
    >
      {meta.glyph}
    </span>
  );
}

function BedStrip({ bed }: { bed: ClaimBits["bedrock"] }) {
  if (!bed) return null;
  return (
    <>
      <div className={`${styles.bed} ${BED_CLS[bed]}`} style={{ height: 5 }} />
      <div className={styles.bedTag}>{BEDROCK[bed].tag}</div>
    </>
  );
}

export function GraphView({
  initialDetail, source, embed = false,
}: {
  initialDetail: ClaimDetail;
  source: DataSource;
  /** Contained mode for the home page: no toolbar/trail, fixed-height stage,
      and no URL or global-keyboard side effects. */
  embed?: boolean;
}) {
  CACHE.set(initialDetail.claim.id, initialDetail);

  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1200, h: 640 });
  const compact = box.w < 700;

  const [view, setView] = useState<View>({ detail: initialDetail, partial: false });
  const [trail, setTrail] = useState<{ id: string; text: string }[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpanded(initialDetail, false));
  const [moreOpen, setMoreOpen] = useState<Set<string>>(new Set());
  const [depsOpen, setDepsOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [edgesShown, setEdgesShown] = useState(true);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const focusId = view.detail.claim.id;
  const focusRef = useRef(focusId);
  focusRef.current = focusId;

  // ---- stage measurement ----------------------------------------------------
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBox({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ---- recentring -------------------------------------------------------------
  const settle = useCallback((id: string, detail: ClaimDetail) => {
    if (focusRef.current !== id) return;
    setView({ detail, partial: false });
  }, []);

  const recenter = useCallback(
    (id: string, opts?: { push?: boolean; viaTrail?: boolean; text?: string }) => {
      if (id === focusRef.current) return;
      const current = view.detail;
      if (!opts?.viaTrail) {
        setTrail((t) => [...t.slice(-11), { id: current.claim.id, text: current.claim.text }]);
      }
      const cached = CACHE.get(id);
      if (cached) {
        setView({ detail: cached, partial: false });
        setExpanded(defaultExpanded(cached, compact));
      } else {
        // Optimistic: the clicked node's subtree (when it lives in the current
        // tree) renders immediately; the fetch fills in the rest.
        const node = findInTree(current.tree, id) ?? undefined;
        const bits: ClaimBits | undefined = node
          ? {
              id: node.id, text: node.text, claimType: node.claim_type,
              status: node.assessment_status, confidence: node.assessment_confidence,
              relation: node.relation_type, reasoning: node.reasoning,
              argumentId: node.argument_id, argumentName: node.argument_name,
              argumentStance: node.argument_stance,
              childCount: node.children.length,
              bedrock: bedrockOf(node.claim_type, node.assessment_status, node.children.length === 0),
              up: false,
            }
          : (current.dependents ?? [])
              .filter((d) => d.id === id)
              .map((d): ClaimBits => ({
                id: d.id, text: d.text, claimType: d.claim_type,
                status: d.assessment_status, confidence: d.assessment_confidence,
                relation: d.relation_type, reasoning: null,
                argumentId: null, argumentName: null, argumentStance: null,
                childCount: 0, bedrock: null, up: true,
              }))[0];
        if (!bits) return;
        const partial = partialFrom(bits, node);
        // Seed the optimistic view with what we already know of the new
        // neighbourhood, so the old focus stays on the map as context while the
        // fetch completes — recentring never blanks the mental map.
        if (node) {
          partial.dependents = [{
            id: current.claim.id,
            text: current.claim.text,
            claim_type: current.claim.claim_type,
            relation_type: node.relation_type ?? "requires",
            assessment_status: current.assessment?.status ?? null,
            assessment_confidence: current.assessment?.confidence ?? null,
          }];
        } else if (bits.up && current.tree) {
          partial.tree = {
            id: bits.id, text: bits.text,
            claim_type: bits.claimType ?? "empirical_derived",
            state: "active", depth: 0,
            relation_type: null, reasoning: null, confidence: null,
            assessment_status: bits.status, assessment_confidence: bits.confidence,
            argument_id: null, argument_name: null, argument_stance: null,
            children: [{
              ...current.tree,
              relation_type: bits.relation ?? "requires",
              reasoning: null,
              argument_id: null, argument_name: null, argument_stance: null,
            }],
          };
        }
        setView({ detail: partial, partial: true });
        setExpanded(defaultExpanded(partial, compact));
        void fetchDetail(id).then((full) => {
          if (full) {
            settle(id, full);
            setExpanded((prev) => (focusRef.current === id ? defaultExpanded(full, compact) : prev));
          }
        });
      }
      setMoreOpen(new Set());
      setDepsOpen(false);
      setEdgesShown(false);
      window.setTimeout(() => setEdgesShown(true), 280);
      if (opts?.push !== false && !embed) {
        window.history.pushState({ epistemeMap: id }, "", `/claims/${encodeURIComponent(id)}/map`);
      }
    },
    [view.detail, compact, settle, embed],
  );

  // Browser back/forward walks the same recentring path.
  useEffect(() => {
    if (embed) return;
    const onPop = () => {
      const m = /\/claims\/([^/]+)\/map/.exec(window.location.pathname);
      if (!m) return;
      const id = decodeURIComponent(m[1]);
      if (id === focusRef.current) return;
      setTrail((t) => (t.length && t[t.length - 1].id === id ? t.slice(0, -1) : t));
      recenter(id, { push: false, viaTrail: true });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [recenter, embed]);

  // Keyboard: ↓ into the decomposition, ↑ to a dependent, ⌫ back along the trail.
  // Skipped in embed mode: the home page owns the window's keys.
  useEffect(() => {
    if (embed) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLElement && /^(input|textarea|select)$/i.test(ev.target.tagName)) return;
      if (ev.key === "Backspace") {
        ev.preventDefault();
        setTrail((t) => {
          if (!t.length) return t;
          const last = t[t.length - 1];
          recenter(last.id, { viaTrail: true });
          return t.slice(0, -1);
        });
      } else if (ev.key === "ArrowDown") {
        const kid = (view.detail.tree?.children ?? []).find((c) => c.relation_type !== "presupposes");
        if (kid) recenter(kid.id);
      } else if (ev.key === "ArrowUp") {
        const dep = (view.detail.dependents ?? [])[0];
        if (dep) recenter(dep.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.detail, recenter, embed]);

  // ---- layout -----------------------------------------------------------------
  const plinthNote = useMemo(() => {
    const d = view.detail;
    if (view.partial) return "Loading decomposition…";
    const bed = bedrockOf(d.claim.claim_type, d.assessment?.status ?? null, true);
    if (bed && (d.tree?.children.length ?? 0) === 0) return BEDROCK[bed].note;
    return decompositionNote({
      decompositionStatus: d.claim.decomposition_status,
      assessed: Boolean(d.assessment),
      stewardState: d.claim.steward_state,
    });
  }, [view]);

  const layout: Layout = useMemo(
    () =>
      computeLayout(view.detail, {
        expanded, moreOpen, depsOpen, compact, plinthNote,
        depsPending: view.partial,
      }),
    [view, expanded, moreOpen, depsOpen, compact, plinthNote],
  );

  // ---- fit: the world scales to the stage; scroll exists only at floor scale ---
  // The fit is symmetric around x=0 (the focus spine), not around the bounding
  // box's centre: the left gutter labels would otherwise push the focus card
  // visually right of centre. Costs a little scale when one side is heavy;
  // buys the reading that the centred claim IS the centre.
  const PAD = 48;
  const halfW = Math.max(-layout.bounds.minX, layout.bounds.maxX) + PAD;
  const contentW = halfW * 2;
  const contentH = layout.bounds.maxY - layout.bounds.minY + PAD * 2;
  const fit = Math.min(1, box.w / contentW, box.h / contentH);
  const SCALE_FLOOR = compact ? 0.7 : 0.55; // below this, text stops being text
  const scale = Math.max(fit, SCALE_FLOOR);
  const scrollable = fit < SCALE_FLOOR - 1e-6;
  const spacerW = Math.max(contentW * scale, box.w);
  const spacerH = Math.max(contentH * scale, box.h);
  const tx = spacerW / 2; // world x=0 lands dead centre
  const ty = (spacerH - contentH * scale) / 2 + (PAD - layout.bounds.minY) * scale;

  // When the stage does scroll, land each recentre with the focus card in view.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !scrollable) return;
    el.scrollTo({
      left: layout.focus.x * scale + tx - box.w / 2,
      top: (layout.focus.y - 120) * scale + ty - box.h / 2,
      behavior: "smooth",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, scrollable]);

  // Entering nodes fade in (exit/enter classes; moves are CSS-transitioned FLIPs).
  const prevKeys = useRef<Set<string>>(new Set());
  const currentKeys = new Set(layout.nodes.map((n) => n.key));
  useEffect(() => {
    const el = stageRef.current;
    if (el) {
      const fresh = el.querySelectorAll('[data-enter="1"]');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fresh.forEach((n) => n.removeAttribute("data-enter"));
      }));
    }
    prevKeys.current = currentKeys;
  });

  // ---- interactions -------------------------------------------------------------
  const showClaimPreview = useCallback((bits: ClaimBits, isFocus: boolean) => {
    setPreview({ kind: "claim", claim: bits, isFocus });
    setHoverId(bits.id);
  }, []);

  const onNodeClick = (n: LNode) => {
    if (n.kind === "pill") return;
    if (n.kind === "more" && n.more) {
      if (n.more.action === "deps") setDepsOpen((v) => !v);
      else if (n.more.key) {
        setMoreOpen((prev) => {
          const next = new Set(prev);
          if (next.has(n.more!.key)) next.delete(n.more!.key);
          else next.add(n.more!.key);
          return next;
        });
      }
      return;
    }
    if (n.claim && n.claim.id !== focusId) {
      // The preview follows the recentre: same claim, now the centred one, and
      // its edge note explains the step just taken.
      setPreview({ kind: "claim", claim: n.claim, isFocus: true });
      recenter(n.claim.id);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---- render helpers -------------------------------------------------------------
  const d = view.detail;
  const focusStatus = d.assessment?.status ?? null;
  const focusMeta = statusMeta(focusStatus);
  const impLevel = importanceLevel(d.claim.importance);
  const argDesc = (argId: string | null): string | null =>
    (d.arguments ?? []).find((a) => a.id === argId)?.content ?? null;
  // Canonical text for every claim in the focus tree, so a written form's
  // [[claim:<id>]] references render as the claims they name.
  const treeTexts = buildClaimTextMap(d.tree);

  const nodeBody = (n: LNode) => {
    switch (n.kind) {
      case "focus":
        return (
          <>
            <div className={styles.eyebrow}>
              <span className="sc">claim · {d.claim.claim_type ? CLAIM_TYPE_LABEL[d.claim.claim_type as ClaimType] : "—"}</span>
              <Link className={styles.pageLink} href={`/claims/${d.claim.id}`} title="Open the claim page — provenance, discourse, assessment">
                claim page ↗
              </Link>
            </div>
            <div className={styles.heroText}>{d.claim.text}</div>
            <div className={styles.focusBand}>
              {d.assessment ? (
                <span className={`badge ${focusMeta.cls}`}>
                  <span className="badge-glyph">{focusMeta.glyph}</span>
                  {focusMeta.label}
                </span>
              ) : (
                <span className="badge unassessed">unassessed</span>
              )}
              {/* Verdict confidence is meta and easily misread as P(claim
                  true); on the map it lives in the hover preview, labelled,
                  not as a bare number beside the badge (#160). */}
              {!view.partial && (
                <span className="imp-pips" title={`importance: ${IMPORTANCE[impLevel].label} — ${IMPORTANCE[impLevel].gloss}`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} className={`imp-pip${i < IMPORTANCE[impLevel].pips ? " on" : ""}`} />
                  ))}
                </span>
              )}
            </div>
          </>
        );
      case "t1": {
        const c = n.claim!;
        return (
          <>
            <div className={styles.chipHead}>
              <Glyph status={c.status} />
            </div>
            <div className={styles.t1Text}>{c.text}</div>
            <div className={styles.chipFoot}>
              {c.childCount > 0 ? (
                <button
                  type="button"
                  className={styles.expander}
                  onClick={(ev) => { ev.stopPropagation(); toggleExpand(c.id); }}
                  aria-expanded={n.expandedNow}
                >
                  {n.expandedNow ? "▾" : "▸"} {c.childCount} subclaim{c.childCount > 1 ? "s" : ""}
                </button>
              ) : c.bedrock ? null : (
                <span className={styles.atomicTag}>atomic</span>
              )}
            </div>
            {/* bedrock replaces the atomic tag — the hatch already says atomic */}
            <BedStrip bed={c.bedrock} />
          </>
        );
      }
      case "t2": {
        const c = n.claim!;
        return (
          <>
            <div className={styles.chipHead}><Glyph status={c.status} size="0.56rem" /></div>
            <div className={styles.t2Text}>{c.text}</div>
            <BedStrip bed={c.bedrock} />
          </>
        );
      }
      case "mini":
        return statusMeta(n.claim!.status).glyph;
      case "dep":
      case "depstub": {
        const c = n.claim!;
        return (
          <>
            <div className={styles.chipHead}>
              <Glyph status={c.status} size="0.58rem" />
            </div>
            <div className={styles.depText}>{c.text}</div>
          </>
        );
      }
      case "pill":
        return (
          <>
            <span>{n.pill!.name}</span>
            <span className={styles.pillStance}>· {n.pill!.stance}</span>
          </>
        );
      case "more":
        return n.more!.label;
      case "side": {
        const c = n.claim!;
        return (
          <>
            <div className={styles.chipHead}>
              <Glyph status={c.status} size="0.56rem" />
              <span className={styles.atomicTag}>presupposed</span>
            </div>
            <div className={styles.sideText}>{c.text}</div>
            <BedStrip bed={c.bedrock} />
          </>
        );
      }
    }
  };

  const kindClass: Record<LNode["kind"], string> = {
    focus: styles.focus, t1: styles.t1, t2: styles.t2, mini: styles.mini,
    dep: styles.dep, depstub: styles.depstub, pill: styles.pill,
    more: styles.more, side: styles.side,
  };

  const ox = layout.bounds.minX;
  const oy = layout.bounds.minY;

  return (
    <div className={embed ? undefined : styles.bleed}>
      {/* toolbar: the map is one view of the claim's address (not in embed) */}
      {!embed && (
        <div className={styles.toolbar}>
          <span className="sc"><Link href={`/claims/${focusId}`}>← claim page</Link></span>
          <span className="sc" style={{ color: "var(--ink-soft)" }}>map view</span>
          {source === "fixture" && (
            <span className="tag" title="The API is not connected; showing a design fixture.">fixture data</span>
          )}
          <span className={`sc ${styles.hint}`} style={{ color: "var(--faint)" }}>
            click a claim to recentre · hover to preview · ⌫ back
          </span>
        </div>
      )}

      {/* trail of the walk so far (not in embed) */}
      {!embed && (
        <div className={styles.trail} aria-label="Trail">
          <span className="sc" style={{ fontSize: "0.56rem" }}>trail</span>
          {trail.slice(-4).map((t, i, arr) => (
            <span key={`${t.id}:${i}`} style={{ display: "inline-flex", gap: "0.45rem", alignItems: "center" }}>
              <button
                type="button"
                className={styles.trailLink}
                onClick={() => {
                  const cut = trail.length - arr.length + i;
                  setTrail(trail.slice(0, cut));
                  recenter(t.id, { viaTrail: true });
                }}
              >
                {t.text}
              </button>
              <span className={styles.trailSep}>›</span>
            </span>
          ))}
          <span className={styles.trailHere}>{d.claim.text}</span>
        </div>
      )}

      {/* the stage */}
      <div
        ref={stageRef}
        className={`${styles.stage}${embed ? ` ${styles.embedStage}` : ""}${scrollable ? ` ${styles.scrollable}` : ""}`}
        role="figure"
        aria-label={`Claim map centred on: ${d.claim.text}`}
      >
        <div style={{ width: spacerW, height: spacerH, position: "relative" }}>
          <div
            className={styles.plane}
            style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
          >
            <svg
              className={styles.edges}
              style={{
                left: ox, top: oy, position: "absolute",
                width: layout.bounds.maxX - ox, height: layout.bounds.maxY - oy,
                opacity: edgesShown ? 1 : 0,
              }}
              viewBox={`0 0 ${layout.bounds.maxX - ox} ${layout.bounds.maxY - oy}`}
              aria-hidden
            >
              {layout.edges.map((e, i) => (
                <path
                  key={i}
                  d={edgePath(e, ox, oy)}
                  data-rel={e.rel}
                  className={[
                    e.mini ? styles.miniEdge : "",
                    hoverId && e.ids.includes(hoverId) ? styles.hl : "",
                  ].join(" ").trim() || undefined}
                />
              ))}
            </svg>

            {layout.nodes.map((n) => {
              const fresh = !prevKeys.current.has(n.key);
              const isMini = n.kind === "mini";
              return (
                <div
                  key={n.key}
                  className={[
                    styles.gnode,
                    kindClass[n.kind],
                    n.kind === "pill"
                      ? n.pill!.stance === "for" ? styles.pillFor
                        : n.pill!.stance === "against" ? styles.pillAgainst : styles.pillNeutral
                      : "",
                  ].join(" ").trim()}
                  data-enter={fresh ? "1" : undefined}
                  style={{
                    left: n.x - n.w / 2,
                    top: n.y,
                    width: n.w,
                    height: n.h,
                    ...(isMini ? statusVars(n.claim!.status) : null),
                  }}
                  role={n.claim && n.claim.id !== focusId ? "button" : undefined}
                  tabIndex={n.claim && n.claim.id !== focusId ? 0 : undefined}
                  aria-label={n.claim ? n.claim.text : n.pill?.name}
                  onClick={() => onNodeClick(n)}
                  onKeyDown={(ev) => { if (ev.key === "Enter") onNodeClick(n); }}
                  onMouseEnter={() => {
                    if (n.claim) showClaimPreview(n.claim, n.kind === "focus");
                    else if (n.kind === "pill") {
                      setPreview({
                        kind: "pill",
                        pill: { name: n.pill!.name, stance: n.pill!.stance, desc: argDesc(n.pill!.argId) },
                      });
                    }
                  }}
                  onMouseLeave={() => setHoverId(null)}
                >
                  {n.kind === "focus" ? nodeBody(n) : nodeBody(n)}
                </div>
              );
            })}

            {layout.labels.map((lb, i) => (
              <span
                key={`${lb.text}:${i}`}
                className={`relation ${RELATION[lb.rel as RelationType]?.cls ?? "rel-requires"} ${styles.elabel}`}
                style={{ left: lb.x, top: lb.y, opacity: edgesShown ? 1 : 0 }}
              >
                {lb.text}
              </span>
            ))}

            {layout.misc.map((m, i) => {
              if (m.kind === "band") {
                return (
                  <div key={`band:${m.text}`} className={styles.band} style={{ left: m.x, top: m.y }}>
                    {m.text}
                  </div>
                );
              }
              if (m.kind === "deplabel") {
                const counts = new Map<AssessmentStatus, number>();
                for (const st of m.dist) {
                  const k = (st ?? "unknown") as AssessmentStatus;
                  counts.set(k, (counts.get(k) ?? 0) + 1);
                }
                return (
                  <div key="deplabel" className={styles.depLabel} style={{ left: m.x - 130, top: m.y }}>
                    {m.pending ? (
                      <span className={styles.depNone}>…</span>
                    ) : m.n === 0 ? (
                      <span className={styles.depNone}>Nothing in the graph builds on this claim yet.</span>
                    ) : (
                      <>
                        <span className={styles.depCount}>{m.n}</span>
                        <span className={styles.depUnit}>depended on by</span>
                        <span className={styles.distBar}>
                          {[...counts.entries()].map(([st, nn]) => (
                            <i
                              key={st}
                              className={statusMeta(st).cls}
                              style={{ width: `${(nn / m.dist.length) * 100}%` }}
                            />
                          ))}
                        </span>
                      </>
                    )}
                  </div>
                );
              }
              // plinth
              return (
                <div key="plinth" className={styles.plinth} style={{ left: m.x - m.w / 2, top: m.y, width: m.w }}>
                  <div className={`${styles.bed} ${styles.bedLg} ${m.bedrock ? BED_CLS[m.bedrock] : styles.bedNone}`} />
                  <div className={styles.plinthNote}>{m.note}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* the margin-note preview: selectable, linked, persistent — and itself
            a recentre target: clicking the note walks to the claim it describes
            (links, buttons, and in-progress text selections excepted) */}
        {preview && (
          <aside
            className={`${styles.preview}${
              preview.kind === "claim" && preview.claim && !preview.isFocus ? ` ${styles.previewClickable}` : ""
            }`}
            aria-live="polite"
            onClick={(ev) => {
              if (preview.kind !== "claim" || !preview.claim || preview.isFocus) return;
              if ((ev.target as HTMLElement).closest("a, button")) return;
              const sel = window.getSelection();
              if (sel && !sel.isCollapsed) return;
              setPreview({ ...preview, isFocus: true });
              recenter(preview.claim.id);
            }}
          >
            {preview.kind === "pill" && preview.pill ? (
              <>
                <div className={styles.previewHead}>
                  <span className="sc">argument · {preview.pill.stance}</span>
                  <button type="button" className={styles.previewClose} onClick={() => setPreview(null)} aria-label="Close preview">✕</button>
                </div>
                <p className={styles.previewText} style={{ fontWeight: 600 }}>{preview.pill.name}</p>
                {preview.pill.desc && (
                  <div className={styles.previewNote}>
                    <ArgumentText content={preview.pill.desc} texts={treeTexts} />
                  </div>
                )}
                <div className={styles.previewFoot}>
                  <span>an argument states how its subclaims combine to bear on the claim</span>
                </div>
              </>
            ) : preview.claim ? (
              (() => {
                const c = preview.claim!;
                const meta = statusMeta(c.status);
                const rel = c.relation ? RELATION[c.relation] : null;
                return (
                  <>
                    <div className={styles.previewHead}>
                      <span className="sc">
                        claim{c.claimType ? ` · ${CLAIM_TYPE_LABEL[c.claimType]}` : ""}
                      </span>
                      <button type="button" className={styles.previewClose} onClick={() => setPreview(null)} aria-label="Close preview">✕</button>
                    </div>
                    <p className={styles.previewText}>{c.text}</p>
                    <div className={styles.previewRow}>
                      <span className={`badge ${meta.cls}`}>
                        <span className="badge-glyph">{meta.glyph}</span>{meta.label}
                      </span>
                      {/* Labelled and meterless: a bar here read as how true
                          the claim is, when the number is only how sure the
                          Steward is of the verdict (#160). */}
                      {c.confidence != null && (
                        <span className={styles.confNum} title={VERDICT_CONFIDENCE_GLOSS}>
                          verdict confidence {c.confidence.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {rel && (
                      <div className={styles.previewNote}>
                        <span className={`relation ${rel.cls} ${styles.relLine}`}>
                          {c.up ? `${rel.label} this claim` : rel.label}
                          {c.argumentName ? ` · ${c.argumentName}` : ""}
                        </span>
                        {c.reasoning || rel.gloss}
                      </div>
                    )}
                    {c.bedrock && (
                      <div className={styles.previewNote} style={{ borderLeftColor: `var(--st-${c.status ?? "unknown"})` }}>
                        {BEDROCK[c.bedrock].note}
                      </div>
                    )}
                    <div className={styles.previewFoot}>
                      <span>{preview.isFocus ? "the centred claim" : "click to recentre the map"}</span>
                      <Link href={`/claims/${c.id}`}>open claim page ↗</Link>
                    </div>
                  </>
                );
              })()
            ) : null}
          </aside>
        )}
      </div>

      {/* legend — a figure caption, not app chrome */}
      <div className={styles.legend}>
        <span className={styles.legendGroup}>
          {STATUS_ORDER.map((s) => (
            <span key={s} className={styles.legendItem}>
              <span className={`${styles.legendGlyph} ${STATUS[s].cls}`}>{STATUS[s].glyph}</span>
              {STATUS[s].label.toLowerCase()}
            </span>
          ))}
        </span>
        <span className={styles.legendRule} />
        <span className={styles.legendGroup}>
          <span className={styles.legendItem}><span className={`${styles.legendBed} ${styles.bedFact}`} />verified fact</span>
          <span className={styles.legendItem}><span className={`${styles.legendBed} ${styles.bedOpen}`} />open question</span>
          <span className={styles.legendItem}><span className={`${styles.legendBed} ${styles.bedValue}`} />value premise</span>
        </span>
        <span className={styles.legendRule} />
        <span className={styles.legendGroup}>
          <span className={styles.legendItem}><span className={styles.legendEdge} style={{ borderColor: "rgba(79,125,74,.7)" }} /><span className="rel-supports">supports</span></span>
          <span className={styles.legendItem}><span className={`${styles.legendEdge} ${styles.dashed}`} style={{ borderColor: "rgba(143,58,44,.7)" }} /><span className="rel-contradicts">contradicts</span></span>
          <span className={styles.legendItem}><span className={`${styles.legendEdge} ${styles.dotted}`} style={{ borderColor: "rgba(154,109,18,.8)" }} /><span className="rel-presupposes">presupposes</span></span>
          <span className={styles.legendItem}><span className={styles.legendEdge} style={{ borderColor: "var(--rule)" }} />requires</span>
        </span>
        <span className={styles.legendCaption}>Fig. — detail falls off with distance; every claim is an address.</span>
      </div>
    </div>
  );
}
