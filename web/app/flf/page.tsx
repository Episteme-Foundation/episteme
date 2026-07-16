import Link from "next/link";
import { StatusBadge, Importance, Confidence } from "@/components/Assessment";
import { RELATION, CLAIM_TYPE_LABEL, statusMeta } from "@/lib/ontology";
import {
  loadAllShowcases,
  CLUSTER_META,
  FLF_CLUSTERS,
  type FlfShowcase,
  type FlfClusterName,
  type FlfInstance,
} from "@/lib/flf";
import s from "./flf.module.css";

// TEMPORARY competition page (issue #78b): "How Episteme works, shown on the FLF
// case studies." Self-contained under /flf — every artifact below is real output
// from running the three case studies through the pipeline on Claude Fable 5.
// Delete the /flf route + web/lib/flf.ts + web/content/flf to remove it whole.

export const metadata = {
  title: "How Episteme works · the FLF case studies",
  description:
    "A worked demonstration of the Episteme stack — ingestion, matching, decomposition, assessment, provenance, and contributions — on the three FLF Epistack case studies.",
};

const SOURCE_TYPE_LABEL: Record<string, string> = {
  primary_data: "primary data",
  peer_reviewed: "peer-reviewed",
  government: "government",
  news_original: "reporting",
  news_secondary: "secondary",
  opinion: "opinion",
  social_media: "social",
  unknown: "source",
};

function Instances({ items }: { items: FlfInstance[] }) {
  return (
    <div className={s.instances}>
      {items.map((it, i) => (
        <div key={i} className={s.instance}>
          <div className={s.instanceHead}>
            <span className={`${s.stance} ${it.stance === "denies" ? s.denies : s.affirms}`}>
              {it.stance}
            </span>
            <span className={s.instanceSrc}>
              {it.source_url ? (
                <a href={it.source_url} target="_blank" rel="noreferrer">
                  {it.source_title}
                </a>
              ) : (
                it.source_title
              )}
              {" · "}
              {SOURCE_TYPE_LABEL[it.source_type] ?? it.source_type}
            </span>
          </div>
          <p className={s.instanceText}>&ldquo;{it.original_text}&rdquo;</p>
        </div>
      ))}
    </div>
  );
}

// Pick the best cluster to illustrate each stage, with graceful fallback to
// whatever ran. Each selector returns [clusterName, showcase] or null.
function firstWith(
  shows: Partial<Record<FlfClusterName, FlfShowcase>>,
  order: FlfClusterName[],
  pred: (sh: FlfShowcase) => boolean,
): [FlfClusterName, FlfShowcase] | null {
  for (const c of order) {
    const sh = shows[c];
    if (sh && pred(sh)) return [c, sh];
  }
  return null;
}

export default function FlfPage() {
  const shows = loadAllShowcases();
  const ran = FLF_CLUSTERS.filter((c) => shows[c]);

  const extraction = firstWith(shows, ["blackholes", "eggs", "lableak"], (sh) => sh.extraction.length > 0);
  const matched = firstWith(shows, ["blackholes", "lableak", "eggs"], (sh) => !!sh.matched && sh.matched.instances.length > 1);
  const decomposed = firstWith(shows, ["blackholes", "eggs", "lableak"], (sh) => !!sh.decomposed && sh.decomposed.children.length > 0);
  const contested = firstWith(shows, ["lableak", "eggs", "blackholes"], (sh) => !!sh.contested);

  return (
    <div className="doc">
      <header className={s.hero}>
        <p className={s.kicker}>FLF Epistack · worked example</p>
        <h1>How Episteme works, shown on three hard questions</h1>
        <p className="lede">
          Episteme turns documents into a queryable graph of claims: it reads a source, pulls out
          the atomic claims, decides which are new, decomposes each to its bedrock, and assesses how
          well the evidence supports it. This page walks that pipeline end to end on the three FLF
          case studies. Every claim, tree, verdict, and quotation below is real output from running
          these sources through the system on <b>Claude Fable 5</b>, not an illustration.
        </p>
        <p>
          The companion <Link href="/docs/architecture">architecture</Link> and{" "}
          <Link href="/docs/constitution">constitution</Link> describe the machinery in general; here
          it is grounded in worked examples. The three cases were chosen to span the range the system
          must handle: one near-settled, one genuinely unresolved, one live and contested.
        </p>

        <div className={s.cases}>
          {FLF_CLUSTERS.map((c) => {
            const meta = CLUSTER_META[c];
            const sh = shows[c];
            return (
              <div key={c} className={s.case}>
                <p className={s.caseTitle}>{meta.title}</p>
                <p className={s.caseQ}>{meta.question}</p>
                {sh ? (
                  <div className={s.caseStats}>
                    <span><b>{sh.counts.claims}</b> claims</span>
                    <span><b>{sh.counts.instances}</b> instances</span>
                    <span><b>{sh.counts.assessed}</b> assessed</span>
                    <span><b>{sh.counts.sources}</b> sources</span>
                  </div>
                ) : (
                  <p className={s.pending}>Ingestion in progress — artifacts appear once the run completes.</p>
                )}
              </div>
            );
          })}
        </div>
      </header>

      {ran.length === 0 && (
        <p className={s.note}>
          The case-study runs are still in progress. This page renders their real artifacts as soon
          as the exports land in <code>web/content/flf/</code>.
        </p>
      )}

      {/* 1 · Ingestion & extraction */}
      <section className={s.stage} id="extraction">
        <p className={s.stageNum}>Stage 1 · Ingestion &amp; extraction</p>
        <h2>From a document to candidate claims</h2>
        <p>
          Ingestion is the expensive, write-side work. An extractor reads the source and pulls out
          the atomic, standalone claims it asserts — each recorded as an <em>instance</em>: the exact
          wording, its source, and the stance the source takes. A claim is never just a sentence
          lifted verbatim; it is a canonical proposition that the instance is evidence for.
        </p>
        {extraction ? (
          <>
            <p className={s.exampleFrom}>
              Example · {CLUSTER_META[extraction[0]].title} · from &ldquo;{extraction[1].extraction[0].source_title}&rdquo;
            </p>
            {extraction[1].extraction.slice(0, 4).map((e) => (
              <div key={e.id} className={s.extractRow}>
                <p className={s.quote}>&ldquo;{e.original_text}&rdquo;</p>
                <p className={s.arrow}>↓ extracted as</p>
                <p style={{ margin: 0 }}>
                  {e.text}{" "}
                  <span style={{ color: "var(--muted)", fontFamily: "var(--sans)", fontSize: ".74rem" }}>
                    · {CLAIM_TYPE_LABEL[e.claim_type] ?? e.claim_type}
                  </span>
                </p>
              </div>
            ))}
          </>
        ) : (
          <p className={s.pending}>Awaiting a completed run.</p>
        )}
      </section>

      {/* 2 · Matching & deduplication */}
      <section className={s.stage} id="matching">
        <p className={s.stageNum}>Stage 2 · Matching &amp; deduplication</p>
        <h2>The same claim, across many sources</h2>
        <p>
          The same proposition recurs across documents in different words. A matcher — vector search
          over claim embeddings, then an LLM judgment on the near-neighbours — decides whether a new
          instance is the <em>same</em> claim as one already in the graph. When it is, the instance
          attaches to the existing canonical claim instead of minting a duplicate, so the work of
          decomposing and assessing is done once and reused everywhere the claim appears.
        </p>
        {matched && matched[1].matched ? (
          <>
            <p className={s.exampleFrom}>
              Example · {CLUSTER_META[matched[0]].title} · one canonical claim,{" "}
              {matched[1].matched.instances.length} instances across sources
            </p>
            <div className={s.claimHead}>
              <p className={s.claimText}>{matched[1].matched.claim.text}</p>
              <div className={s.metaRow}>
                {matched[1].matched.claim.status && <StatusBadge status={matched[1].matched.claim.status} />}
                <Importance value={matched[1].matched.claim.importance} showLabel />
              </div>
            </div>
            <Instances items={matched[1].matched.instances} />
          </>
        ) : (
          <p className={s.pending}>Awaiting a run with a multi-source claim.</p>
        )}
      </section>

      {/* 3 · Decomposition */}
      <section className={s.stage} id="decomposition">
        <p className={s.stageNum}>Stage 3 · Decomposition</p>
        <h2>Breaking a claim down to what it rests on</h2>
        <p>
          A claim is only as good as the claims beneath it. The Claim Steward decomposes each claim
          into the sub-claims it depends on, organised under named <em>arguments</em> — lines of
          reasoning that bear for or against it. Every edge records how the child relates to the
          parent ({Object.values(RELATION).map((r) => r.label).join(", ")}), and decomposition
          continues until it reaches bedrock: a verifiable fact, a genuinely contested empirical
          question, or a value premise.
        </p>
        {decomposed && decomposed[1].decomposed ? (
          <>
            <p className={s.exampleFrom}>Example · {CLUSTER_META[decomposed[0]].title}</p>
            <div className={s.claimHead}>
              <p className={s.claimText}>{decomposed[1].decomposed.claim.text}</p>
              <div className={s.metaRow}>
                {decomposed[1].decomposed.claim.status && (
                  <StatusBadge status={decomposed[1].decomposed.claim.status} />
                )}
                <Importance value={decomposed[1].decomposed.claim.importance} showLabel />
                <span>{decomposed[1].decomposed.children.length} sub-claims</span>
              </div>
            </div>
            {(() => {
              const d = decomposed[1].decomposed!;
              const argName = (id: string | null) => d.arguments.find((a) => a.id === id) ?? null;
              // Group children by their argument, preserving order.
              const groups: { arg: (typeof d.arguments)[number] | null; kids: typeof d.children }[] = [];
              for (const c of d.children) {
                const arg = argName(c.argument_id);
                const last = groups[groups.length - 1];
                if (last && last.arg?.id === (arg?.id ?? null)) last.kids.push(c);
                else groups.push({ arg, kids: [c] });
              }
              return groups.map((g, gi) => (
                <div key={gi} className={s.argument}>
                  {g.arg && (
                    <div>
                      <span className={s.argName}>{g.arg.name ?? "Argument"}</span>{" "}
                      <span className={s.argStance}>· {g.arg.stance}</span>
                    </div>
                  )}
                  <ul className={s.children}>
                    {g.kids.map((c) => (
                      <li key={c.id} className={s.child}>
                        <span className={s.rel} title={RELATION[c.relation_type]?.gloss}>
                          {RELATION[c.relation_type]?.label ?? c.relation_type}
                        </span>
                        <div>
                          <p className={s.childText}>{c.text}</p>
                          <p className={s.childMeta}>
                            {c.status ? statusMeta(c.status).label : "unassessed"}
                            {" · "}
                            {CLAIM_TYPE_LABEL[c.claim_type] ?? c.claim_type}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ));
            })()}
          </>
        ) : (
          <p className={s.pending}>Awaiting a decomposed claim.</p>
        )}
      </section>

      {/* 4 · Assessment & stewardship propagation */}
      <section className={s.stage} id="assessment">
        <p className={s.stageNum}>Stage 4 · Assessment &amp; stewardship propagation</p>
        <h2>Reaching — and keeping — a verdict</h2>
        <p>
          With the structure in place, the Steward assesses the claim: a status (verified,
          supported, contested, unsupported, contradicted, or unknown), a confidence, a
          reader-facing summary, and a full reasoning trace. Because claims are linked, a change
          ripples: reassessing a sub-claim marks its parents for re-stewarding, so a verdict stays
          current as the evidence beneath it moves. Work drains in importance order, so the most
          load-bearing claims are assessed first.
        </p>
        {decomposed && decomposed[1].decomposed?.claim.status ? (
          <div className={s.assessment}>
            <div className={s.assessmentHead}>
              <StatusBadge status={decomposed[1].decomposed.claim.status} size="lg" />
              <Confidence
                value={decomposed[1].decomposed.claim.confidence}
                status={decomposed[1].decomposed.claim.status}
              />
            </div>
            <p style={{ fontWeight: 600, margin: "0 0 .4rem" }}>
              {decomposed[1].decomposed.claim.text}
            </p>
            {decomposed[1].decomposed.claim.summary && (
              <p style={{ margin: 0 }}>{decomposed[1].decomposed.claim.summary}</p>
            )}
            {decomposed[1].decomposed.claim.reasoning_trace && (
              <p className={s.trace}>{decomposed[1].decomposed.claim.reasoning_trace}</p>
            )}
          </div>
        ) : (
          <p className={s.pending}>Awaiting an assessed claim.</p>
        )}
      </section>

      {/* 5 · Provenance, disagreement & auditability */}
      <section className={s.stage} id="provenance">
        <p className={s.stageNum}>Stage 5 · Provenance, disagreement &amp; auditability</p>
        <h2>Holding a dispute open, with its receipts</h2>
        <p>
          The ground truth in Episteme is the source/instance layer: who said what, and where. When
          sources genuinely disagree, the system does not pick a winner and delete the loser. The
          canonical claim carries instances that <em>affirm</em> it and instances that <em>deny</em>{" "}
          it, and reads that split as a strong signal toward <StatusBadge status="contested" />. The
          disagreement lives on one node, with every side&rsquo;s exact wording and source attached.
        </p>
        {contested && contested[1].contested ? (
          <>
            <p className={s.exampleFrom}>
              Example · {CLUSTER_META[contested[0]].title} · one claim, sources on both sides
            </p>
            <div className={s.claimHead}>
              <p className={s.claimText}>{contested[1].contested.claim.text}</p>
              <div className={s.metaRow}>
                {contested[1].contested.claim.status && (
                  <StatusBadge status={contested[1].contested.claim.status} />
                )}
                <Importance value={contested[1].contested.claim.importance} showLabel />
              </div>
            </div>
            <Instances items={contested[1].contested.instances} />
          </>
        ) : (
          <p className={s.pending}>Awaiting a claim carrying opposing instances.</p>
        )}
      </section>

      {/* 6 · Contributions handling */}
      <section className={s.stage} id="contributions">
        <p className={s.stageNum}>Stage 6 · Contributions handling</p>
        <h2>Challenge, review, escalation, arbitration</h2>
        <p>
          The graph is open to correction. Anyone can challenge an assessment, submit evidence, or
          propose a new claim through the API or the extension. A contribution enters a review
          pipeline: the Contribution Reviewer weighs it, low-stakes accepted changes flow straight
          in, and genuine conflicts escalate to the Dispute Arbitrator, whose ruling is recorded with
          its reasoning. Every step is logged and attributable.
        </p>
        <div className={s.flow}>
          <div className={s.flowStep}><b>1 · Submit</b>A challenge or evidence lands against a claim (API / extension).</div>
          <div className={s.flowStep}><b>2 · Review</b>The Contribution Reviewer judges merit, novelty, and good faith.</div>
          <div className={s.flowStep}><b>3 · Escalate</b>Genuine conflicts become an appeal for arbitration.</div>
          <div className={s.flowStep}><b>4 · Arbitrate</b>The Dispute Arbitrator rules; the assessment updates with a trace.</div>
        </div>
        <p className={s.note}>
          Corpus ingestion drives extraction through assessment but does not itself generate
          contributions, so this stage is shown as the real pipeline it runs, not with a live
          artifact yet. A scripted contribution scenario against one of these case studies (for
          example, a challenge to a black-hole assessment) is the remaining piece to make this
          section concrete — tracked as a follow-up to issue&nbsp;#78.
        </p>
      </section>

      <p className={s.disclaimer}>
        Temporary page for the FLF Epistack competition. Artifacts were produced by running the
        <code> blackholes</code>, <code>eggs</code>, and <code>lableak</code> corpus clusters through
        the pipeline on Claude Fable 5; they are a snapshot and may differ from the live graph. Browse
        the real graph at <Link href="/claims">/claims</Link>.
      </p>
    </div>
  );
}
