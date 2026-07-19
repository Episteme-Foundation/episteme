import type { AssessmentStatus, ClaimDetail, TreeNode } from "./types";
import { STATUS_ORDER } from "./ontology";

// The pre-search /claims overview (#206). While the graph is small it is a few
// coherent investigations, not a stack of newest claims, so the landing state
// names those investigations instead of dumping the feed. What counts as a
// "territory" is an editorial judgment the graph can't make for us — the
// decomposition DAG has no clean disjoint components (contradicting sides share
// one root; a nutrition subtree hangs under another territory's anchor) — so
// the ANCHORS and labels are curated here. The COUNTS and verdict mix are
// derived from each anchor's subtree at render (see loadTerritories), so the
// numbers stay honest as the graph grows without anyone editing this file.
//
// Longer term this becomes data-driven (a stored territory id or embedding
// clusters on the API side, exposed as GET /territories); that is its own issue
// when a fourth or tenth cluster makes hand-curation the bottleneck. Until then
// a hand-picked anchor is also more robust than deriving roots: as claimspace
// fuses into one connected graph an auto-detected "root" can gain an incoming
// edge and vanish, while the editorial anchor stays put.

export interface TerritoryConfig {
  key: string;
  name: string;
  // The question the investigation is chasing, shown in italics under the name.
  question: string;
  // The claim the card is fronted by and the map opens on.
  anchorId: string;
  // Curated fallback shown when live data is unavailable (offline/API down), so
  // a card still names its core claim. The live core text overrides this.
  coreText: string;
}

// Curated order is the display order. Cardiovascular is deliberately ONE
// territory with the LDL/statins subtree folded in: it is honestly one
// investigation, and splitting it reads as padding at this scale.
export const TERRITORIES: TerritoryConfig[] = [
  {
    key: "covid",
    name: "COVID origin",
    question: "Did the pandemic begin in a market or a lab?",
    anchorId: "3795e3d8-6487-40e2-9930-00b55a0a0a74",
    coreText:
      "SARS-CoV-2 originated through zoonotic spillover at the Huanan Seafood Market",
  },
  {
    key: "collider",
    name: "Collider safety",
    question: "Could high-energy physics experiments actually endanger the planet?",
    anchorId: "75fc05be-bffe-4c76-9a86-96209e6b5c1e",
    coreText: "Particle collisions at the LHC pose no danger to Earth.",
  },
  {
    key: "cardiovascular",
    name: "Eggs, cholesterol & the heart",
    question: "Does dietary cholesterol from eggs actually raise cardiovascular risk?",
    anchorId: "585e0bd0-5830-4104-851e-7d4130a1be05",
    coreText:
      "Regular egg consumption increases cardiovascular disease risk in healthy people",
  },
];

export interface TerritoryStats {
  coreText: string;
  coreStatus: AssessmentStatus | null;
  // Assessed-only: what has actually been weighed. The total (including the
  // unassessed long tail) rides along as a quiet secondary figure.
  assessedCount: number;
  totalCount: number;
  // Verdict mix over the assessed claims, in STATUS_ORDER, only present verdicts.
  mix: { status: AssessmentStatus; count: number }[];
}

export interface Territory extends TerritoryConfig {
  // Null when live data could not be loaded; the card degrades to name +
  // question + core claim + map link, without counts or the mix bar.
  stats: TerritoryStats | null;
}

// Walk the anchor's decomposition subtree and tally verdicts over DISTINCT
// claims. The API's tree already dedupes a shared subclaim (later occurrences
// are stubs with empty children) and terminates cycles via a visited set, so a
// diamond or a loop can't inflate the count; the Map keyed by id is a second
// guard. Assessed = a non-null verdict, matching the browse feed's default.
export function computeTerritoryStats(detail: ClaimDetail): TerritoryStats {
  const seen = new Map<string, AssessmentStatus | null>();
  const visit = (n: TreeNode | undefined) => {
    if (!n || seen.has(n.id)) return;
    seen.set(n.id, n.assessment_status);
    n.children?.forEach(visit);
  };
  visit(detail.tree);

  const counts = new Map<AssessmentStatus, number>();
  for (const status of seen.values()) {
    if (status) counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const mix = STATUS_ORDER.filter((s) => counts.has(s)).map((s) => ({
    status: s,
    count: counts.get(s)!,
  }));

  return {
    coreText: detail.claim.text,
    coreStatus: detail.tree?.assessment_status ?? detail.assessment?.status ?? null,
    assessedCount: [...seen.values()].filter(Boolean).length,
    totalCount: seen.size,
    mix,
  };
}
