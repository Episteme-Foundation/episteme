import type { ClaimDetail, SearchResultItem } from "./types";

// Fixture data for design iteration before the API is wired in. Built on the
// Admin Constitution's own worked example (§2, §16): "inflation was high"
// canonicalised, decomposing into a verified BLS bedrock fact and a contested
// definitional threshold — which is exactly why the parent lands on SUPPORTED
// rather than VERIFIED.

const FLAGSHIP: ClaimDetail = {
  claim: {
    id: "inflation-2022",
    text: "US CPI inflation in 2022 exceeded the threshold for “high” inflation.",
    claim_type: "empirical_derived",
    state: "active",
    decomposition_status: "complete",
    created_by: "extractor",
    created_at: "2024-11-02T14:20:00Z",
    updated_at: "2026-03-18T09:12:00Z",
  },
  subclaim_count: 4,
  assessment: {
    id: "a-1",
    status: "supported",
    confidence: 0.78,
    reasoning_trace:
      "The measured-magnitude leg of this claim is settled: the Bureau of Labor Statistics reported year-over-year CPI growth of 6.5% for 2022, a verified bedrock fact traceable to the primary release. The claim's overall status turns instead on a definitional subclaim — what annual rate constitutes “high” inflation. Under the most common reference point (the Federal Reserve's 2% target, or the looser 5% figure used in policy commentary) 6.5% clearly qualifies; but the threshold is a contested definitional choice rather than an empirical fact, and a minority of sources reserve “high” for double-digit or hyperinflationary regimes. Because the arithmetic is verified but rests on a contested definition, the claim is Supported rather than Verified. It is not Contested overall: no credible source disputes the 6.5% figure, and under any mainstream threshold the conclusion holds.",
    subclaim_summary: { verified: 2, contested: 1, supported: 1 },
    assessed_at: "2026-03-18T09:12:00Z",
  },
  trajectory: {
    current: { status: "supported", confidence: 0.78, assessed_at: "2026-03-18T09:12:00Z", is_current: true, trigger: "contribution_accepted" },
    history: [
      { status: "supported", confidence: 0.78, assessed_at: "2026-03-18T09:12:00Z", is_current: true, trigger: "contribution_accepted" },
      { status: "verified", confidence: 0.71, assessed_at: "2025-06-01T00:00:00Z", is_current: false, trigger: "source_added" },
      { status: "unknown", confidence: 0.40, assessed_at: "2024-11-02T14:20:00Z", is_current: false, trigger: "initial_decomposition" },
    ],
    total_assessments: 3,
    status_transitions: 2,
  },
  arguments: [
    {
      id: "arg-direct",
      name: "Direct measurement",
      stance: "for",
      content:
        "The official CPI series places 2022 inflation at 6.5%, which exceeds every mainstream threshold for “high” inflation. The only live question is definitional, not empirical.",
      evidence_urls: ["https://www.bls.gov/news.release/archives/cpi_01122023.htm"],
      created_by: "decomposer",
      created_at: "2024-11-02T14:25:00Z",
    },
  ],
  instances: [
    {
      id: "inst-1",
      source_id: "src-bls",
      original_text:
        "The Consumer Price Index for All Urban Consumers (CPI-U) rose 6.5 percent over the 12 months ending December 2022.",
      context: "From the BLS monthly CPI news release, summary table for the 2022 calendar year.",
      confidence: 0.99,
      source_title: "Consumer Price Index — December 2022 (BLS)",
      source_url: "https://www.bls.gov/news.release/archives/cpi_01122023.htm",
      source_type: "primary_data",
    },
    {
      id: "inst-2",
      source_id: "src-news",
      original_text: "Inflation hit a 40-year high in 2022, squeezing households across the country.",
      context: "Lede of a retrospective news analysis on the 2022 cost-of-living crisis.",
      confidence: 0.82,
      source_title: "A year of soaring prices, in charts",
      source_url: "https://example.com/2022-inflation-charts",
      source_type: "news_secondary",
    },
  ],
  tree: {
    id: "inflation-2022",
    text: "US CPI inflation in 2022 exceeded the threshold for “high” inflation.",
    claim_type: "empirical_derived",
    state: "active",
    depth: 0,
    relation_type: null, reasoning: null, confidence: null,
    assessment_status: "supported", assessment_confidence: 0.78,
    argument_id: null, argument_name: null, argument_stance: null,
    children: [
      {
        id: "bls-cpi",
        text: "The US Bureau of Labor Statistics reported CPI-U growth of 6.5% for the 12 months ending December 2022.",
        claim_type: "empirical_verifiable", state: "active", depth: 1,
        relation_type: "requires",
        reasoning: "The claim asserts a magnitude of inflation; that magnitude is fixed by the official CPI release. If the reported figure were different, the parent claim's truth would change accordingly.",
        confidence: 0.99, assessment_status: "verified", assessment_confidence: 0.97,
        argument_id: "arg-direct", argument_name: "Direct measurement", argument_stance: "for",
        children: [],
      },
      {
        id: "threshold-def",
        text: "The threshold for “high” annual CPI inflation is 5%.",
        claim_type: "definitional", state: "contested", depth: 1,
        relation_type: "defines",
        reasoning: "Whether 6.5% counts as “high” depends entirely on where the threshold is set. This is a definitional choice, not an empirical finding, and reasonable sources place it differently.",
        confidence: 0.6, assessment_status: "contested", assessment_confidence: 0.55,
        argument_id: "arg-direct", argument_name: "Direct measurement", argument_stance: "for",
        children: [
          {
            id: "fed-target",
            text: "The Federal Reserve's stated long-run inflation target is 2%.",
            claim_type: "empirical_verifiable", state: "active", depth: 2,
            relation_type: "supports",
            reasoning: "A 2% target is the conventional baseline against which deviations are judged “high”; 6.5% is more than triple it.",
            confidence: 0.95, assessment_status: "verified", assessment_confidence: 0.96,
            argument_id: "arg-direct", argument_name: "Direct measurement", argument_stance: "for",
            children: [],
          },
          {
            id: "hyperinflation-view",
            text: "“High inflation” should be reserved for double-digit or hyperinflationary regimes.",
            claim_type: "definitional", state: "active", depth: 2,
            relation_type: "contradicts",
            reasoning: "A minority usage reserves “high” for much larger figures, under which 6.5% would not qualify. Surfacing this keeps the definitional disagreement visible rather than resolved by fiat.",
            confidence: 0.5, assessment_status: "unsupported", assessment_confidence: 0.4,
            argument_id: "arg-direct", argument_name: "Direct measurement", argument_stance: "for",
            children: [],
          },
        ],
      },
      {
        id: "arith",
        text: "6.5% is greater than 5%.",
        claim_type: "empirical_verifiable", state: "active", depth: 1,
        relation_type: "supports",
        reasoning: "Trivial arithmetic linking the measured magnitude to the threshold.",
        confidence: 1.0, assessment_status: "verified", assessment_confidence: 1.0,
        argument_id: "arg-direct", argument_name: "Direct measurement", argument_stance: "for",
        children: [],
      },
    ],
  },
};

const INDEX: SearchResultItem[] = [
  { id: "inflation-2022", text: FLAGSHIP.claim.text, claim_type: "empirical_derived", state: "active", similarity_score: 0.91, assessment_status: "supported", assessment_confidence: 0.78 },
  { id: "min-wage", text: "The federal minimum wage should be raised to $15 per hour.", claim_type: "normative", state: "contested", similarity_score: 0.74, assessment_status: "contested", assessment_confidence: 0.62 },
  { id: "universe-age", text: "The universe is approximately 13.8 billion years old.", claim_type: "empirical_derived", state: "active", similarity_score: 0.69, assessment_status: "verified", assessment_confidence: 0.94 },
  { id: "mw-employment", text: "Raising the minimum wage to $15 reduces teen employment.", claim_type: "causal", state: "active", similarity_score: 0.66, assessment_status: "contested", assessment_confidence: 0.5 },
  { id: "deflation-2009", text: "The United States experienced sustained deflation throughout 2009.", claim_type: "empirical_verifiable", state: "active", similarity_score: 0.58, assessment_status: "contradicted", assessment_confidence: 0.88 },
];

export function getClaim(id: string): ClaimDetail | null {
  return id === FLAGSHIP.claim.id ? FLAGSHIP : null;
}

export function listClaims(): SearchResultItem[] {
  return INDEX;
}

export const FLAGSHIP_ID = FLAGSHIP.claim.id;
