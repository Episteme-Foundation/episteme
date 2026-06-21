"use client";

import { useState } from "react";
import Link from "next/link";
import type { TreeNode, Stance } from "@/lib/types";
import { RELATION, STANCE_LABEL } from "@/lib/ontology";
import { Swatch } from "./Assessment";

// Group a node's children by the argument each decomposition edge belongs to,
// preserving order. A claim's subclaims are organised under the named lines of
// reasoning (arguments) they serve — the constitution's central structure.
function groupByArgument(children: TreeNode[]) {
  const groups: { id: string | null; name: string | null; stance: Stance | null; nodes: TreeNode[] }[] = [];
  for (const c of children) {
    const last = groups[groups.length - 1];
    if (last && last.id === c.argument_id) last.nodes.push(c);
    else groups.push({ id: c.argument_id, name: c.argument_name, stance: c.argument_stance, nodes: [c] });
  }
  return groups;
}

function Node({ node }: { node: TreeNode }) {
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
                  <div className="arghead">
                    <span className="sc">argument</span>
                    <span className="argname">{g.name}</span>
                    {g.stance && <span className={`arg-stance ${g.stance}`}>{STANCE_LABEL[g.stance]}</span>}
                  </div>
                )}
                {g.nodes.map((n) => (
                  <Node node={n} key={n.id} />
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
              <div className="arghead">
                <span className="sc">argument</span>
                <span className="argname">{g.name}</span>
                {g.stance && <span className={`arg-stance ${g.stance}`}>{STANCE_LABEL[g.stance]}</span>}
              </div>
            )}
            {g.nodes.map((n) => (
              <Node node={n} key={n.id} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
