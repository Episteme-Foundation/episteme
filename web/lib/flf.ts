import "server-only";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { AssessmentStatus, ClaimType, RelationType, Stance, SourceType } from "./types";

// Page-ready artifacts for the temporary FLF explainer page (issue #78), written
// by `scripts/corpus/export-flf.ts` from a corpus run and vendored into
// web/content/flf/. Read at the server, like the docs content. This whole module
// (and the /flf route) is self-contained so it can be removed in one delete.

const FLF_DIR = resolve(process.cwd(), "content", "flf");

export interface FlfInstance {
  original_text: string;
  context: string | null;
  stance: "affirms" | "denies";
  confidence: number;
  source_title: string;
  source_url: string | null;
  source_type: SourceType;
}

export interface FlfClaim {
  id: string;
  text: string;
  claim_type: ClaimType;
  importance: number;
  decomposition_status: string;
  steward_state: string;
  status: AssessmentStatus | null;
  confidence: number | null;
  summary: string | null;
  reasoning_trace: string | null;
}

export interface FlfChild {
  id: string;
  text: string;
  claim_type: ClaimType;
  importance: number;
  relation_type: RelationType;
  reasoning: string;
  argument_id: string | null;
  status: AssessmentStatus | null;
  confidence: number | null;
}

export interface FlfArgument {
  id: string;
  name: string | null;
  stance: Stance;
  content: string;
}

export interface FlfShowcase {
  cluster: string;
  generatedAt: string;
  counts: {
    sources: number;
    claims: number;
    instances: number;
    assessed: number;
    relationships: number;
    arguments: number;
  };
  sources: { title: string; url: string | null; source_type: SourceType; instances: number }[];
  extraction: {
    id: string;
    text: string;
    claim_type: ClaimType;
    importance: number;
    original_text: string;
    source_title: string;
  }[];
  matched: { claim: FlfClaim; instances: FlfInstance[] } | null;
  contested: { claim: FlfClaim; instances: FlfInstance[] } | null;
  decomposed:
    | { claim: FlfClaim; instances: FlfInstance[]; arguments: FlfArgument[]; children: FlfChild[] }
    | null;
  assessments: {
    text: string;
    importance: number;
    status: AssessmentStatus;
    confidence: number;
    summary: string | null;
  }[];
}

export const FLF_CLUSTERS = ["blackholes", "eggs", "lableak"] as const;
export type FlfClusterName = (typeof FLF_CLUSTERS)[number];

export const CLUSTER_META: Record<
  FlfClusterName,
  { title: string; question: string; character: string }
> = {
  blackholes: {
    title: "Micro black holes at the LHC",
    question: "Could the Large Hadron Collider create a black hole that destroys the Earth?",
    character: "a near-settled question resting on a deep, interlocking body of physics",
  },
  eggs: {
    title: "The health effects of eggs",
    question: "Are eggs good or bad to eat — for whom, and how would we know?",
    character: "a genuinely unresolved question where the cruxes are about evidence quality",
  },
  lableak: {
    title: "The origin of SARS-CoV-2",
    question: "Did the virus arise by natural spillover, or from a research-related accident?",
    character: "a live, high-stakes dispute the graph must hold open rather than resolve",
  },
};

export function loadShowcase(cluster: FlfClusterName): FlfShowcase | null {
  try {
    return JSON.parse(readFileSync(resolve(FLF_DIR, `${cluster}.json`), "utf-8")) as FlfShowcase;
  } catch {
    // A cluster whose run hasn't been exported yet renders as "not yet ingested".
    return null;
  }
}

export function loadAllShowcases(): Partial<Record<FlfClusterName, FlfShowcase>> {
  const out: Partial<Record<FlfClusterName, FlfShowcase>> = {};
  for (const c of FLF_CLUSTERS) {
    const s = loadShowcase(c);
    if (s) out[c] = s;
  }
  return out;
}
