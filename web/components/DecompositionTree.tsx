"use client";

import { useState } from "react";
import Link from "next/link";
import type { TreeNode, Stance } from "@/lib/types";
import { RELATION, STANCE_LABEL, argumentVerdictMeta } from "@/lib/ontology";
import { buildClaimTextMap, hasClaimLinks } from "@/lib/claim-links";
import { ArgumentText } from "./ArgumentText";
import { Swatch } from "./Assessment";

// Group a node's children by the argument each decomposition edge belongs to,
// preserving order. A claim's subclaims are organised under the named lines of
// reasoning (arguments) they serve — the constitution's central structure.
function groupByArgument(children: TreeNode[]) {
  const groups: {
    id: string | null; name: string | null; stance: Stance | null;
    content: string | null; verdict: string | null; evaluation: string | null;
    nodes: TreeNode[];
  }[] = [];
  for (const c of children) {
    const last = groups[groups.length - 1];
    if (last && last.id === c.argument_id) last.nodes.push(c);
    else groups.push({
      id: c.argument_id, name: c.argument_name, stance: c.argument_stance,
      content: c.argument_content ?? null,
      verdict: c.argument_verdict ?? null,
      evaluation: c.argument_evaluation ?? null,
      nodes: [c],
    });
  }
  return groups;
}

// The steward's verdict on the inference (issue #173), as a quiet tag beside
// the stance. Nothing renders until the argument has been evaluated.
function ArgumentVerdictTag({ verdict }: { verdict: string | null }) {
  const meta = argumentVerdictMeta(verdict);
  if (!meta) return null;
  return (
    <span className={`arg-verdict ${meta.cls}`} title={meta.gloss}>
      {meta.label}
    </span>
  );
}

// The argument's written form, when it has one: prose with the subclaims
// linked inline. Legacy label-only content (no links) is not worth repeating
// under the name, so it is skipped until the backfill upgrades it.
function ArgumentProse({ content, texts }: { content: string | null; texts: Map<string, string> }) {
  if (!content || !hasClaimLinks(content)) return null;
  return (
    <p className="argform">
      <ArgumentText content={content} texts={texts} />
    </p>
  );
}

// The steward's evaluation (issue #173), set off from the written form: the
// written form states the inference, this judges it, with the load-bearing
// premises linked inline.
function ArgumentEvaluationProse({ evaluation, texts }: { evaluation: string | null; texts: Map<string, string> }) {
  if (!evaluation) return null;
  return (
    <p className="argeval">
      <ArgumentText content={evaluation} texts={texts} />
    </p>
  );
}

function Node({ node, texts }: { node: TreeNode; texts: Map<string, string> }) {
  const [open, setOpen] = useState(node.depth < 2);
  const [showReason, setShowReason] = useState(false);
  const hasChildren = node.children.length > 0;
  const rel = node.relation_type ? RELATION[node.relation_type] : null;

  return (
    <div className="node">
      <div className="node-row">
        <button
          className={`node-toggle${hasChildren ? "" : " leaf"}`}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "collapse" : "expand"}
          aria-expanded={open}
        >
          {hasChildren ? (open ? "▾" : "▸") : "•"}
        </button>

        <div className="node-main">
          {node.assessment_status && <Swatch status={node.assessment_status} />}{" "}
          {rel && (
            <span className={`relation ${rel.cls} node-relation`} title={rel.gloss}>
              {rel.label}
            </span>
          )}
          <span
            className={`node-text${node.reasoning ? " clickable" : ""}`}
            onClick={node.reasoning ? () => setShowReason((v) => !v) : undefined}
            title={node.reasoning ? "show the reasoning for this dependency" : undefined}
          >
            {node.text}
          </span>{" "}
          <Link className="plain" href={`/claims/${node.id}`} title="open this claim" style={{ color: "var(--faint)" }}>↗</Link>
          {/* "shown above" pointed at a first occurrence the reader has
              usually never expanded; name what the node is instead (#197),
              in the map's vocabulary ("shared"). */}
          {node.subtree_collapsed && (
            <span
              title="A shared subclaim: it belongs to more than one branch of this decomposition, and its own subclaims are listed at its other occurrence. ↗ opens its page."
              style={{ color: "var(--faint)", fontSize: "0.85em", fontStyle: "italic" }}
            >
              {" "}· shared subclaim
            </span>
          )}
          {node.children_truncated && (
            <span
              title="this tree response is size-capped; open the claim to see all of its subclaims"
              style={{ color: "var(--faint)", fontSize: "0.85em", fontStyle: "italic" }}
            >
              {" "}· more on its page
            </span>
          )}
        </div>

        <span className="node-meta">
          <span className="tag kind">{node.claim_type.replace(/_/g, " ")}</span>
        </span>
      </div>

      {showReason && node.reasoning && (
        <div className="node-reasoning">
          <span className="sc">Why this edge</span>
          {node.reasoning}
        </div>
      )}

      {hasChildren && open && (
        <div className="node-children">
          {groupByArgument(node.children).map((g, i) => {
            // Only label a new argument branch — not children continuing the
            // same line of reasoning as their parent.
            const newArgument = g.name && g.id !== node.argument_id;
            return (
              <div className="argblock" key={g.id ?? `g${i}`} style={{ margin: "0.4rem 0" }}>
                {newArgument && (
                  <>
                    <div className="arghead">
                      <span className="sc">argument</span>
                      <span className="argname">{g.name}</span>
                      {g.stance && <span className={`arg-stance ${g.stance}`}>{STANCE_LABEL[g.stance]}</span>}
                      <ArgumentVerdictTag verdict={g.verdict} />
                    </div>
                    <ArgumentProse content={g.content} texts={texts} />
                    <ArgumentEvaluationProse evaluation={g.evaluation} texts={texts} />
                  </>
                )}
                {g.nodes.map((n) => (
                  <Node node={n} texts={texts} key={n.id} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DecompositionTree({ tree }: { tree: TreeNode }) {
  const texts = buildClaimTextMap(tree);
  return (
    <div className="tree">
      {tree.children.length === 0 ? (
        <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
          This claim is atomic — it bottoms out in a bedrock fact, a contested empirical
          question, or a value premise, and does not decompose further.
        </p>
      ) : (
        groupByArgument(tree.children).map((g, i) => (
          <div className="argblock" key={g.id ?? `g${i}`}>
            {g.name && (
              <>
                <div className="arghead">
                  <span className="sc">argument</span>
                  <span className="argname">{g.name}</span>
                  {g.stance && <span className={`arg-stance ${g.stance}`}>{STANCE_LABEL[g.stance]}</span>}
                  <ArgumentVerdictTag verdict={g.verdict} />
                </div>
                <ArgumentProse content={g.content} texts={texts} />
                <ArgumentEvaluationProse evaluation={g.evaluation} texts={texts} />
              </>
            )}
            {g.nodes.map((n) => (
              <Node node={n} texts={texts} key={n.id} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
