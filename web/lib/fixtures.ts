import type { ClaimDetail, SearchResultItem } from "./types";

// Fixture data for design iteration before the API is wired in. Built on the
// Admin Constitution's own worked example (§2, §16): "inflation was high"
// canonicalised, decomposing into a verified BLS bedrock fact and a contested
// definitional threshold — which is exactly why the parent lands on SUPPORTED
// rather than VERIFIED.

// The "Direct measurement" argument's written form (issue #129): brief prose
// stating how the subclaims combine, each referenced inline so renderers link
// them. One string, threaded onto every edge in the argument (as the tree API
// does) and into the argument record itself.
const ARG_DIRECT_WRITTEN =
  "Because [[claim:bls-cpi|the BLS measured 6.5% CPI growth for 2022]] and " +
  "[[claim:arith|that figure exceeds]] [[claim:threshold-def|the 5% threshold " +
  "for “high” inflation]], the claim follows. [[claim:fed-target|The Federal " +
  "Reserve's 2% target]] anchors the threshold, though [[claim:hyperinflation-view|a " +
  "minority usage]] reserves “high” for double-digit regimes.";

const FLAGSHIP: ClaimDetail = {
  claim: {
    id: "inflation-2022",
    text: "US CPI inflation in 2022 exceeded the threshold for “high” inflation.",
    claim_type: "empirical_derived",
    state: "active",
    decomposition_status: "complete",
    importance: 0.9,
    steward_state: "done",
    created_by: "extractor",
    created_at: "2024-11-02T14:20:00Z",
    updated_at: "2026-03-18T09:12:00Z",
  },
  subclaim_count: 4,
  assessment: {
    id: "a-1",
    status: "supported",
    // Verdict confidence: how sure the Steward is that "supported" is right.
    confidence: 0.78,
    // Credence that the claim is true: high, since under any mainstream
    // threshold the 6.5% figure qualifies as "high".
    claim_credence: 0.9,
    summary:
      "US consumer prices rose 6.5% over 2022, so whether inflation was “high” comes down to where you set the bar. Against the Federal Reserve's 2% target — or the looser 5% often used in policy debate — 6.5% is unambiguously high, which is the mainstream reading. The one genuine question is definitional, not factual: a minority reserve “high” for double-digit or hyperinflationary episodes, under which 2022 would not qualify. The underlying figure itself is not in dispute.",
    reasoning_trace:
      "The measured-magnitude leg of this claim is settled: the Bureau of Labor Statistics reported year-over-year CPI growth of 6.5% for 2022, a verified bedrock fact traceable to the primary release. The claim's overall status turns instead on a definitional subclaim — what annual rate constitutes “high” inflation. Under the most common reference point (the Federal Reserve's 2% target, or the looser 5% figure used in policy commentary) 6.5% clearly qualifies; but the threshold is a contested definitional choice rather than an empirical fact, and a minority of sources reserve “high” for double-digit or hyperinflationary regimes. Because the arithmetic is verified but rests on a contested definition, the claim is Supported rather than Verified. It is not Contested overall: no credible source disputes the 6.5% figure, and under any mainstream threshold the conclusion holds.",
    subclaim_summary: { verified: 2, contested: 1, supported: 1 },
    assessed_at: "2026-03-18T09:12:00Z",
  },
  trajectory: {
    current: { status: "supported", confidence: 0.78, assessed_at: "2026-03-18T09:12:00Z", is_current: true, trigger: "contribution_accepted" },
    history: [
      { status: "supported", confidence: 0.78, assessed_at: "2026-03-18T09:12:00Z", is_current: true, trigger: "contribution_accepted" },
      { status: "verified", confidence: 0.71, assessed_at: "2025-06-01T00:00:00Z", is_current: false, trigger: "subclaim_change" },
      { status: "unknown", confidence: 0.40, assessed_at: "2024-11-02T14:20:00Z", is_current: false, trigger: "pipeline_assessment" },
    ],
    total_assessments: 3,
    status_transitions: 2,
  },
  arguments: [
    {
      id: "arg-direct",
      name: "Direct measurement",
      stance: "for",
      content: ARG_DIRECT_WRITTEN,
      evidence_urls: ["https://www.bls.gov/news.release/archives/cpi_01122023.htm"],
      created_by: "decomposer",
      created_at: "2024-11-02T14:25:00Z",
    },
  ],
  // Claims elsewhere in the graph that lean on this one — reverse decomposition
  // edges. These fill the right margin of the claim page (issue #42). They are
  // design stubs: the ids resolve to the generic "not in fixture set" page until
  // the API is wired in.
  dependents: [
    {
      id: "fed-rate-hikes-justified",
      text: "The Federal Reserve was justified in raising interest rates aggressively through 2022–2023.",
      claim_type: "evaluative",
      relation_type: "requires",
      assessment_status: "supported",
      assessment_confidence: 0.66,
    },
    {
      id: "real-wages-fell-2022",
      text: "Real (inflation-adjusted) wages fell for most US workers in 2022.",
      claim_type: "empirical_derived",
      relation_type: "requires",
      assessment_status: "verified",
      assessment_confidence: 0.9,
    },
    {
      id: "cost-of-living-crisis-2022",
      text: "2022 was the worst US cost-of-living squeeze in four decades.",
      claim_type: "evaluative",
      relation_type: "supports",
      assessment_status: "contested",
      assessment_confidence: 0.58,
    },
    {
      id: "tightening-overreaction",
      text: "The 2022 monetary tightening was a policy overreaction to transitory inflation.",
      claim_type: "causal",
      relation_type: "contradicts",
      assessment_status: "contested",
      assessment_confidence: 0.47,
    },
    {
      id: "savings-erosion-2022",
      text: "Inflation in 2022 materially eroded the value of US household cash savings.",
      claim_type: "empirical_derived",
      relation_type: "presupposes",
      assessment_status: "supported",
      assessment_confidence: 0.72,
    },
  ],
  // The public contribution record (#171), newest first. The accepted
  // challenge is the one behind the trajectory's 2026-03-18 reassessment
  // (trigger: contribution_accepted), so the fixture tells one coherent story:
  // a contributor challenged the Verified verdict, review accepted the
  // challenge, and the claim moved to Supported.
  record: [
    {
      contribution: {
        id: "co-1",
        contributor: { id: "contrib-okafor", display_name: "M. Okafor" },
        contribution_type: "challenge",
        content:
          "The Verified status overstates the case. The 6.5% figure is beyond dispute, but “high” has no settled threshold: the verdict rests on a definitional choice the assessment itself marks as contested. A claim whose truth turns on a contested definition should be Supported, not Verified.",
        evidence_urls: [],
        submitted_at: "2026-03-16T18:40:00Z",
        review_status: "accepted",
      },
      review: {
        id: "rev-1",
        decision: "accept",
        reasoning:
          "The challenge is well taken. The measured-magnitude leg is verified, but the threshold subclaim is definitional and genuinely contested; under the constitution a verdict cannot be stronger than its weakest load-bearing premise. The claim has been queued for reassessment with the definitional dependence weighted explicitly.",
        confidence: 0.86,
        policy_citations: ["§7 (calibration)", "§16 (worked example)"],
        reviewed_at: "2026-03-17T09:05:00Z",
        reviewed_by: "contribution_reviewer",
      },
      appeal: null,
      arbitration: null,
    },
    {
      contribution: {
        id: "co-2",
        contributor: { id: "contrib-hb", display_name: "hb_truthwatch" },
        contribution_type: "challenge",
        content:
          "The BLS number is fabricated. Real inflation in 2022 was over 15% and the official CPI series is manipulated to hide it.",
        evidence_urls: ["https://example.com/shadow-cpi"],
        submitted_at: "2025-09-04T14:11:00Z",
        review_status: "rejected",
      },
      review: {
        id: "rev-2",
        decision: "reject",
        reasoning:
          "The challenge disputes a verified bedrock fact without engaging the primary release. The cited page recomputes a private index with an undisclosed methodology; it does not identify any error in the BLS series. A challenge to primary data needs evidence at the level of the data.",
        confidence: 0.93,
        policy_citations: ["§4 (evidence standards)"],
        reviewed_at: "2025-09-04T20:30:00Z",
        reviewed_by: "contribution_reviewer",
      },
      appeal: {
        id: "ap-1",
        appellant: { id: "contrib-hb", display_name: "hb_truthwatch" },
        appeal_reasoning:
          "The rejection assumes official statistics are trustworthy, which is the very point in dispute.",
        submitted_at: "2025-09-06T08:02:00Z",
        status: "resolved",
      },
      arbitration: {
        id: "arb-1",
        outcome: "uphold_original",
        decision: "Rejection upheld.",
        reasoning:
          "The appeal restates the original claim rather than addressing the review's grounds. No arbiter found the alternative index methodologically credible; distrust of a source is not itself evidence against it.",
        consensus_achieved: true,
        human_review_recommended: false,
        arbitrated_at: "2025-09-07T16:45:00Z",
        arbitrated_by: "dispute_arbitrator",
      },
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
        argument_content: ARG_DIRECT_WRITTEN,
        children: [],
      },
      {
        id: "threshold-def",
        text: "The threshold for “high” annual CPI inflation is 5%.",
        claim_type: "definitional", state: "active", depth: 1,
        relation_type: "defines",
        reasoning: "Whether 6.5% counts as “high” depends entirely on where the threshold is set. This is a definitional choice, not an empirical finding, and reasonable sources place it differently.",
        confidence: 0.6, assessment_status: "contested", assessment_confidence: 0.55,
        argument_id: "arg-direct", argument_name: "Direct measurement", argument_stance: "for",
        argument_content: ARG_DIRECT_WRITTEN,
        children: [
          {
            id: "fed-target",
            text: "The Federal Reserve's stated long-run inflation target is 2%.",
            claim_type: "empirical_verifiable", state: "active", depth: 2,
            relation_type: "supports",
            reasoning: "A 2% target is the conventional baseline against which deviations are judged “high”; 6.5% is more than triple it.",
            confidence: 0.95, assessment_status: "verified", assessment_confidence: 0.96,
            argument_id: "arg-direct", argument_name: "Direct measurement", argument_stance: "for",
            argument_content: ARG_DIRECT_WRITTEN,
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
            argument_content: ARG_DIRECT_WRITTEN,
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
        argument_content: ARG_DIRECT_WRITTEN,
        children: [],
      },
    ],
  },
};

const INDEX: SearchResultItem[] = [
  { id: "inflation-2022", text: FLAGSHIP.claim.text, claim_type: "empirical_derived", state: "active", similarity_score: 0.91, importance: 0.9, assessment_status: "supported", assessment_confidence: 0.78 },
  { id: "min-wage", text: "The federal minimum wage should be raised to $15 per hour.", claim_type: "normative", state: "active", similarity_score: 0.74, importance: 0.7, assessment_status: "contested", assessment_confidence: 0.62 },
  { id: "universe-age", text: "The universe is approximately 13.8 billion years old.", claim_type: "empirical_derived", state: "active", similarity_score: 0.69, importance: 0.55, assessment_status: "verified", assessment_confidence: 0.94 },
  { id: "mw-employment", text: "Raising the minimum wage to $15 reduces teen employment.", claim_type: "causal", state: "active", similarity_score: 0.66, importance: 0.4, assessment_status: "contested", assessment_confidence: 0.5 },
  // An unassessed, low-importance leaf — left queued under the Steward's budget.
  { id: "cpi-basket-weights", text: "The CPI shelter component was reweighted in the 2023 basket revision.", claim_type: "empirical_verifiable", state: "active", similarity_score: 0.61, importance: 0.18, assessment_status: null, assessment_confidence: null },
  { id: "deflation-2009", text: "The United States experienced sustained deflation throughout 2009.", claim_type: "empirical_verifiable", state: "active", similarity_score: 0.58, importance: 0.35, assessment_status: "contradicted", assessment_confidence: 0.88 },
];

export function getClaim(id: string): ClaimDetail | null {
  return id === FLAGSHIP.claim.id ? FLAGSHIP : null;
}

export function listClaims(): SearchResultItem[] {
  return INDEX;
}

export const FLAGSHIP_ID = FLAGSHIP.claim.id;
