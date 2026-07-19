import type { TreeNode } from "./types";

// An argument's written form embeds inline claim references:
//   [[claim:<id>]]              — rendered as the claim's canonical text
//   [[claim:<id>|inline text]]  — rendered as the authored phrasing
// The backend validates ids as uuids; the parser here is looser so design
// fixtures with slug ids render the same way.
const CLAIM_LINK = /\[\[claim:([^\]|]+)(?:\|([^\]]*))?\]\]/g;

export type WrittenFormSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; claimId: string; display: string | null };

export type ProseSegment = WrittenFormSegment | { kind: "url"; href: string };

/** Split a written form into plain-text and claim-link segments, in order. */
export function parseWrittenForm(content: string): WrittenFormSegment[] {
  const segments: WrittenFormSegment[] = [];
  let last = 0;
  for (const m of content.matchAll(CLAIM_LINK)) {
    if (m.index! > last) segments.push({ kind: "text", text: content.slice(last, m.index) });
    segments.push({ kind: "link", claimId: m[1]!, display: m[2] ?? null });
    last = m.index! + m[0].length;
  }
  if (last < content.length) segments.push({ kind: "text", text: content.slice(last) });
  return segments;
}

// A bare source URL cited in prose (issue #203). Deliberately simple: a run
// of non-whitespace after the scheme; sentence punctuation is trimmed off the
// end afterwards, since a URL usually sits mid-sentence or inside parens.
const BARE_URL = /https?:\/\/[^\s<>"“”]+/g;

/**
 * parseWrittenForm plus bare-URL detection: assessment prose carries the same
 * [[claim:<id>]] references as argument written forms, and may also cite its
 * sources by URL. Plain prose passes through as a single text segment.
 */
export function parseProse(content: string): ProseSegment[] {
  const segments: ProseSegment[] = [];
  for (const seg of parseWrittenForm(content)) {
    if (seg.kind !== "text") {
      segments.push(seg);
      continue;
    }
    let last = 0;
    for (const m of seg.text.matchAll(BARE_URL)) {
      let url = m[0];
      // Trailing sentence punctuation belongs to the prose, not the URL; a
      // trailing ")" comes off only when the URL itself opened no paren.
      while (/[.,;:!?'"’]$/.test(url) || (url.endsWith(")") && !url.includes("("))) {
        url = url.slice(0, -1);
      }
      if (url === "https://" || url === "http://") continue;
      if (m.index! > last) segments.push({ kind: "text", text: seg.text.slice(last, m.index) });
      segments.push({ kind: "url", href: url });
      last = m.index! + url.length;
    }
    if (last < seg.text.length) segments.push({ kind: "text", text: seg.text.slice(last) });
  }
  return segments;
}

// Distinguishes a real written form from the creation-time label that legacy
// arguments carry in `content` (the backfill upgrades those over time): only
// prose that references its subclaims is worth rendering as an argument.
export function hasClaimLinks(content: string): boolean {
  return content.search(CLAIM_LINK) !== -1;
}

/**
 * id → canonical text for every claim in a decomposition tree, so bare
 * [[claim:<id>]] references resolve to current claim text at render time
 * without another fetch — a written form's links are subclaims of the same
 * tree the caller is already holding.
 */
export function buildClaimTextMap(root: TreeNode | undefined | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!root) return map;
  const walk = (node: TreeNode) => {
    map.set(node.id, node.text);
    node.children.forEach(walk);
  };
  walk(root);
  return map;
}
