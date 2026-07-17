import Link from "next/link";
import s from "./flf.module.css";

// TEMPORARY submission page (issue #78) for the FLF Epistack competition. It is a
// plain reference document: it points reviewers at the live graph, the docs, and
// the code, then answers the competition's "what we're looking for" questions by
// describing what Episteme actually does today, quoting the constitution, and
// linking real claims. Where we do not have a full answer, it says so.
// Self-contained under /flf; delete the route to remove it whole.

export const metadata = {
  title: "Episteme · FLF Epistack submission notes",
  description:
    "How Episteme handles the ingestion, structure, and assessment questions in the FLF Epistack brief, with the constitution quoted and real claims linked.",
};

const GH = "https://github.com/Episteme-Foundation/episteme";
// Real, live claims chosen as worked examples. All three are contested cruxes in
// the SARS-CoV-2 origins cluster, the one FLF case study currently in the graph.
const LAB_ORIGIN = "ec268800-7ee7-42de-a29d-395c50e83148"; // "SARS-CoV-2 has a laboratory origin"
const ZOONOSIS = "3795e3d8-6487-40e2-9930-00b55a0a0a74"; // Huanan-market spillover, 3 sourced instances
const FURIN = "ae9615d8-3701-4a41-8206-cd92e416ced8"; // furin cleavage site, 2 named arguments

function Quote({ children, cite }: { children: React.ReactNode; cite: string }) {
  return (
    <blockquote className={s.quote}>
      {children}
      <cite className={s.quoteCite}>
        Administrator Constitution, <Link href="/docs/constitution">{cite}</Link>
      </cite>
    </blockquote>
  );
}

function Q({ children }: { children: React.ReactNode }) {
  return <p className={s.question}>{children}</p>;
}

export default function FlfPage() {
  return (
    <div className="doc">
      <header className={s.hero}>
        <p className={s.kicker}>FLF Epistack · submission notes</p>
        <h1>How Episteme handles the ingestion, structure, and assessment questions</h1>
        <p className="lede">
          Episteme is a public knowledge graph of claims. It reads sources, extracts the
          propositions they assert, links each claim to every source that speaks to it,
          decomposes a claim into what it rests on, and assesses how well the evidence supports
          it. The graph is maintained by LLM administrators bound by a public constitution, and
          every judgment carries a reasoning trace that anyone can inspect and challenge.
        </p>
        <p>
          The best way to evaluate the system is to read the graph and the governing documents
          directly, so this page points at them first and then answers the brief&rsquo;s questions
          in terms of what the system does today. Where we have not built something, or have built
          it but not yet tested it under pressure, the text says so plainly.
        </p>

        <div className={s.links}>
          <div className={s.linkRow}>
            <span className={s.what}>Browse the graph</span>
            <span className={s.where}><Link href="/claims">/claims</Link></span>
          </div>
          <div className={s.linkRow}>
            <span className={s.what}>A contested crux, worked end to end</span>
            <span className={s.where}>
              <Link href={`/claims/${LAB_ORIGIN}`}>the claim</Link>
              {" · "}
              <Link href={`/claims/${LAB_ORIGIN}/map`}>its map</Link>
            </span>
          </div>
          <div className={s.linkRow}>
            <span className={s.what}>The architecture, the constitution, the seven agents</span>
            <span className={s.where}>
              <Link href="/docs/architecture">architecture</Link>
              {" · "}
              <Link href="/docs/constitution">constitution</Link>
              {" · "}
              <Link href="/docs/agents">agents</Link>
            </span>
          </div>
          <div className={s.linkRow}>
            <span className={s.what}>The source</span>
            <span className={s.where}><a href={GH}>github.com/Episteme-Foundation/episteme</a></span>
          </div>
        </div>

        <p style={{ color: "var(--muted)", fontFamily: "var(--sans)", fontSize: ".82rem" }}>
          The three FLF case studies are the origin of SARS-CoV-2, the safety of micro black holes
          at the LHC, and the health effects of eggs. The SARS-CoV-2 cluster is live in the graph
          now and every linked claim below is from it. Black holes and eggs are being ingested;
          their claim links will be added here once they land.
        </p>
      </header>

      <p>
        The brief splits an epistemic investigation into three layers: ingestion, structure, and
        assessment. We find the same division useful, and the agent organization is built along
        it. What follows takes the brief&rsquo;s questions in that order.
      </p>

      {/* ---------------------------------------------------------------- Ingestion */}
      <section className={s.layer} id="ingestion">
        <p className={s.layerNum}>Layer 1 · Ingestion</p>
        <h2>Turning a messy, multi-source evidence base into something structured</h2>

        <div className={s.qa}>
          <Q>Extract and attribute claims to specific sources, with provenance metadata (who said what, when, in what context).</Q>
          <p>
            The extractor reads a source and surfaces the discrete propositions it asserts. Each is
            recorded as an <em>instance</em>: the source&rsquo;s own wording, the surrounding
            context, and whether the source affirms or denies the claim. The instances for a claim
            sit together on the claim page, so a reader sees every source that has spoken to the same
            proposition, in that source&rsquo;s own words, in one place.
          </p>
          <Quote cite="§17">
            When a statement in a source text is matched to a canonical claim, the admin creates an
            instance linking the specific utterance, with its original text and context, to the
            canonical claim. This preserves the ability to see exactly what was said while enabling
            aggregation across instances.
          </Quote>
          <p className={s.see}>
            See it: the zoonosis-origin claim carries several sourced instances on{" "}
            <Link href={`/claims/${ZOONOSIS}`}>its claim page</Link>.
          </p>
          <p className={s.gap}>
            <b>What we do not do yet.</b> We do not trace provenance recursively, following a claim
            back through the chain of who cited whom to its ultimate origin. Doing that exhaustively
            takes a great deal of recursive search, and it is not necessary for judging whether a
            claim is true, so we have not built it. It is clearly valuable and it belongs on the
            claim page, and we intend to pursue it. It should get easier as Episteme scales and more
            original sources are already in the graph to trace back to.
          </p>
        </div>

        <div className={s.qa}>
          <Q>Identify when the same claim appears across multiple sources in different forms.</Q>
          <p>
            This is the matcher&rsquo;s job, and the reason canonical forms exist. When a new source
            states a proposition the graph already holds, under different words or as its negation,
            the matcher links a new instance to the existing claim rather than minting a duplicate.
            The canonical form is kept short and frame-independent so that two authors arguing
            opposite sides of a question land on the same node.
          </p>
          <Quote cite="§4">
            A claim and its denial, however, are not two claims but one. They pose the same question
            and turn on the same considerations, differing only in which answer a source endorses.
          </Quote>
          <p className={s.see}>
            See it: &ldquo;SARS-CoV-2 has a laboratory origin&rdquo; and the Huanan-market spillover
            claim are held as two live, opposed claims, neither merged into the other:{" "}
            <Link href={`/claims/${LAB_ORIGIN}`}>lab origin</Link>,{" "}
            <Link href={`/claims/${ZOONOSIS}`}>zoonosis</Link>.
          </p>
        </div>

        <div className={s.qa}>
          <Q>Search for resources with bearing on the topics and subtopics at hand.</Q>
          <p>
            The Claim Steward, the agent that owns a claim, searches the web for evidence when it
            assesses. That is real, but it is assessment-time search aimed at getting one claim
            right, not a systematic survey of a field. Its limits are worth being honest about, and
            they are the subject of &ldquo;surface what is missing&rdquo; in the assessment layer
            below.
          </p>
        </div>

        <div className={s.qa}>
          <Q>Capture useful metadata tags, relating sources and claims to topics, methodologies, deference, and assumptions.</Q>
          <p>
            We do not attach flat topic or methodology tags to claims. The graph is, in a sense,
            already metadata: the decomposition of a claim into its arguments, its subclaims, and its
            assumptions is recursively rich structure that a reader can follow as far down as they
            want. Rather than label a claim from the outside, we record the relationships that place
            it. An assumption, for instance, is not a tag but a subclaim on a{" "}
            <em>presupposes</em> edge, which means it can itself be examined and assessed.
          </p>
          <Quote cite="§2">
            Claims decompose into subclaims. The admin&rsquo;s most important function is to identify
            and articulate these decomposition relationships faithfully.
          </Quote>
        </div>
      </section>

      {/* ---------------------------------------------------------------- Structure */}
      <section className={s.layer} id="structure">
        <p className={s.layerNum}>Layer 2 · Structure</p>
        <h2>Documenting the relationships so the shape of the argument is navigable</h2>

        <div className={s.qa}>
          <Q>Resolve the inference structure: which claims and evidence are offered as support for which other claims.</Q>
          <p>
            Each claim is decomposed into the subclaims it rests on, grouped under named{" "}
            <em>arguments</em>, with every edge labelled by how the child bears on the parent:
            requires, supports, contradicts, specifies, defines, or presupposes. Each argument also
            carries a short written form stating how its subclaims combine. Decomposition stops at
            contestedness, not at logical bedrock, so a claim no informed person disputes is left a
            leaf even when much depends on it.
          </p>
          <Quote cite="§2">
            The stopping condition is contestedness, not logical primitiveness. A claim reaches
            bedrock when no informed person in the live discourse would actually dispute it, not when
            it has been reduced to something logically primitive.
          </Quote>
          <p className={s.see}>
            See it: the furin-cleavage-site claim decomposes into two named arguments over six
            subclaims on <Link href={`/claims/${FURIN}`}>its page</Link> and{" "}
            <Link href={`/claims/${FURIN}/map`}>its map</Link>.
          </p>
        </div>

        <div className={s.qa}>
          <Q>Represent the discourse structure: where people address different sub-questions, and their differences of emphasis.</Q>
          <p>
            When a claim has more than one distinct line of reasoning, each is a named argument with
            its own subclaims, for or against. Where the validity of an argument&rsquo;s framework is
            itself in dispute, that meta-claim enters the same structure as a presupposition, so a
            dispute about the terms of the debate lives in the claim layer rather than off to the
            side. Different sources emphasize different arguments, and because each source&rsquo;s
            instances record which claims it engaged and on which side, the emphasis is recoverable.
          </p>
          <Quote cite="§2">
            A claim may have multiple distinct arguments, coherent, self-contained lines of reasoning
            that bear on its truth or falsity. They are not competing decompositions of the same
            claim; they are independent lines of reasoning.
          </Quote>
        </div>

        <div className={s.qa}>
          <Q>Capture relationships regarding similar but not identical claims: different framings, conditions, caveats, or estimates of uncertainty.</Q>
          <p>
            Canonical forms surface the parameters that actually change a claim&rsquo;s truth
            conditions, using a placeholder when a load-bearing parameter is left unspecified. So
            &ldquo;inflation was high&rdquo; meaning &ldquo;above two percent&rdquo; is a different
            claim from the same words meaning &ldquo;above wage growth,&rdquo; and the two are held
            apart and related rather than merged. Claims that differ only by a condition or a caveat
            are linked, often by a <em>specifies</em> edge, so the qualification is visible as
            structure.
          </p>
          <Quote cite="§16">
            Two superficially identical claims may be different if their load-bearing parameters
            differ. Two differently phrased claims may be the same if they differ only in wording.
          </Quote>
        </div>

        <div className={s.qa}>
          <Q>Track how the structure evolves over time.</Q>
          <p>
            Assessments are provisional and versioned. Each claim keeps its assessment history, and
            when a subclaim&rsquo;s assessment changes, the steward of a dependent claim is notified
            to reconsider. When the pipeline&rsquo;s own rules change in a way that would alter what
            gets minted or how it is valued, a claim&rsquo;s pipeline epoch lets an older cohort be
            retired and re-derived rather than silently carried forward.
          </p>
          <Quote cite="§22">
            The world changes. New evidence emerges, studies are retracted, predictions are borne out
            or refuted. The admin updates assessments when the underlying situation changes.
          </Quote>
          <p className={s.gap}>
            <b>What we do not do yet.</b> The history we keep is mainly at the assessment level. We do
            not yet present a full structural diff over time, a view of how the shape of an argument
            itself changed as claims were added, merged, or split.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- Assessment */}
      <section className={s.layer} id="assessment">
        <p className={s.layerNum}>Layer 3 · Assessment</p>
        <h2>Evaluating what to believe, and what to look at next</h2>

        <div className={s.qa}>
          <Q>Identify rhetorical moves that carry more persuasive weight than evidential weight.</Q>
          <p>
            We handle this structurally rather than by trying to detect rhetoric as such. Three
            things do the work. Canonicalization strips a source&rsquo;s framing down to a neutral
            proposition that both sides would accept, so a persuasive framing does not survive into
            the claim. The division of roles means the agent that reads the source and might be swayed
            by it, the extractor, is not the agent that judges whether the claim is true. And the
            Claim Steward assesses the canonical claim on its evidence, outside the original
            source&rsquo;s framing, under a constitution that binds it to weigh evidence rather than
            authority or presentation.
          </p>
          <Quote cite="§5">
            When assessing a claim, the admin examines the evidence and reasoning directly, not
            merely the reputation of who made the claim.
          </Quote>
        </div>

        <div className={s.qa}>
          <Q>Flag correlated evidence being treated as independent.</Q>
          <p>
            We do not have a mechanism aimed specifically at this, and the constitution does not call
            it out. In the graph so far we have not seen the mistake, and we think the emphasis on
            mapping the logical arguments and weighing the evidence fairly tends to guard against it.
            We are not against telling a model what to watch for, but we have found that naively
            adding rules for how to think can cause overcorrection, so we are reluctant to add a
            warning here before we have evidence that it helps.
          </p>
        </div>

        <div className={s.qa}>
          <Q>Identify cruxes: the disagreements that, if resolved, would most change the overall picture.</Q>
          <p>
            This is close to the center of the design. A claim&rsquo;s importance is defined as
            roughly how consequential it would be to get wrong, multiplied by how genuinely contested
            it is, judged against all of claimspace rather than the local neighborhood. That is a
            crux measure directly: a claim that much turns on and that is actually in dispute. The
            steward spends effort in proportion, and decomposition drives toward the specific
            subclaims where the disagreement actually lives.
          </p>
          <Quote cite="§19">
            What earns high importance is that getting the claim wrong would be consequential and the
            claim is genuinely contested or heavily consulted, a live crux, not settled scaffolding.
          </Quote>
          <p className={s.see}>
            See it: &ldquo;SARS-CoV-2 has a laboratory origin&rdquo; is scored as a central,
            contested crux on <Link href={`/claims/${LAB_ORIGIN}`}>its page</Link>.
          </p>
        </div>

        <div className={s.qa}>
          <Q>Surface what is missing: important sources or perspectives not represented in the working knowledge base.</Q>
          <p>
            Honestly, what is most often missing is more sources. For SARS-CoV-2 we ingested only a
            corner of the discourse, centered on the Rootclaim debate and mainstream scientific
            writing. That is a reasonable corner, since it holds itself to higher standards and tends
            to focus on the questions that matter, but we cannot rule out that it left out claims
            which, properly investigated, would add arguments to the central question or change how
            the graph weighs it.
          </p>
          <p>
            The steward does search proactively, but that only goes so far. An agent trying to work
            out what is true is naturally drawn to the arguments it knows best from pretraining and
            trusts most, which in a case like this one tends to sanewash, and which leaves out claims
            that are in fact routinely made. The agents are told to map the arguments in good faith
            and keep an open mind, but they still carry a bias toward consensus and share many of the
            blind spots of the existing epistemic environment. Casting a wider net at ingestion is
            part of the answer. The other part is that Episteme is built to be open to the public, so
            that the perspectives an agent misses can be contributed and then held to the same
            standard as everything else.
          </p>
          <Quote cite="§1">
            The system succeeds when users can see where consensus exists and where it does not, and
            where disagreement is empirical, and thus potentially resolvable with evidence, versus
            where it is fundamental.
          </Quote>
        </div>

        <div className={s.qa}>
          <Q>Provide frameworks for calibrating confidence that account for out-of-model error, adversarial information environments, and the limits of any single analyst.</Q>
          <p>
            The status vocabulary is about the state of the evidence rather than a bare probability.
            A claim is verified, supported, contested, unsupported, contradicted, or unknown, each
            defined by how the evidence stands, and the confidence attached to an assessment is the
            steward&rsquo;s confidence in that reading. Effort scales with importance, and before it
            records a verdict the steward runs a second pass that tries to refute its own conclusion.
            On the limits of any single analyst, our answer is the organization itself: separate
            agents with separate duties, a curator checking for consistency across claims, and
            heavier scrutiny reserved for the most important contested claims.
          </p>
          <Quote cite="§7">
            The admin does not round uncertain claims up to verified or down to false. The
            graph&rsquo;s value comes from honest representation of the state of knowledge.
          </Quote>
          <p className={s.gap}>
            <b>What we do not claim.</b> We have not built explicit modeling of out-of-model error,
            and we would not claim to have solved calibration. The multi-agent design is our current
            answer to the single-analyst limit, and we expect to keep revising it.
          </p>
        </div>

        <div className={s.qa}>
          <Q>Distinguish what the debate settled from what it merely performed settling.</Q>
          <p>
            Refusing false resolution is the system&rsquo;s first commitment. A genuinely contested
            question is held contested, with the strongest form of each side represented, rather than
            rounded to a winner. At the same time, not every disagreement is genuine, so a fringe or
            bad-faith objection is noted without being raised to false parity. The SARS-CoV-2 origin
            question is a fair test: the graph holds the laboratory-origin claim and the market-
            spillover claim as two live contested claims, neither merged into the other and neither
            quietly resolved, with the weight of expert opinion recorded without erasing the minority
            case.
          </p>
          <Quote cite="§1">
            An admin who clearly maps an unresolvable disagreement has done their job well. An admin
            who imposes false resolution has failed.
          </Quote>
        </div>
      </section>

      {/* ---------------------------------------------------------------- Honesty */}
      <section className={s.layer} id="not-yet">
        <p className={s.layerNum}>What we have not done, and where we want to learn</p>
        <h2>The honest boundary</h2>
        <p>
          Some of the machinery the brief asks about is deployed but not yet proven. Contributions,
          conflict review, escalation, and arbitration are built and running, but we have not tested
          them against real bad-faith contributions at scale. We describe that layer as something we
          expect to work and are still hardening, not something we have demonstrated. We have not yet
          added adversarial agents, and we think we will need them to handle bad-faith public
          contributions robustly. On this subproblem we do not claim to be ahead of people who have
          worked on it more directly, and we are looking to learn from them.
        </p>
        <p>
          One design choice is worth stating, because it is deliberate rather than unfinished. We did
          not build assessment as a judge scoring two advocates in a staged debate. We think a single
          Claim Steward with a duty to the truth and to good epistemics is likelier to reach a sound
          verdict than a judge refereeing adversaries. The lawyering model, for all that it beats the
          known alternatives in a courtroom, rewards rhetorical sleight of hand, which is the opposite
          of what we want at the point of judgment. Adversarial agents have a place in stress-testing
          a verdict, not in standing between the evidence and the verdict.
        </p>
        <p>
          Provenance tracing, a structural diff of a claim over time, and topic-level metadata are
          things whose value we see and have chosen not to build yet. The reasoning behind each is in
          its section above.
        </p>
      </section>

      <p className={s.disclaimer}>
        Temporary page for the FLF Epistack competition. It describes the system as it runs today and
        links live claims; the graph is maintained continuously, so a linked assessment may have moved
        since this was written. Read the graph at <Link href="/claims">/claims</Link>, the governing
        texts under <Link href="/docs">/docs</Link>, and the code on{" "}
        <a href={GH}>GitHub</a>.
      </p>
    </div>
  );
}
