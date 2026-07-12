/**
 * LLM-as-judge for the corpus-run scorecard (#99).
 *
 * Grades a single assessed claim against the constitution's standards —
 * readability, reasoning-fit, impartiality, whether the text clears the claim
 * bar (contestability), decomposition granularity, and an independent
 * importance estimate. Runs through the real LLM client so calls are metered by
 * the budget tracker and priced like any other agent call. The judge model is a
 * separate knob (`JUDGE_MODEL`, default Sonnet) so it is never the same context
 * as the agent under test.
 */
import { completeStructured } from "../../src/llm/client.js";
import { loadConfig } from "../../src/config.js";

const CONSTITUTION_STANDARDS = `Key standards (from the Episteme constitution):
- A claim is a single, reusable, CONTESTABLE proposition — something informed people could genuinely dispute with evidence or reasons. Definitional glosses, textbook theorems, and uncontested mathematical/bedrock facts are NOT claims.
- Decomposition identifies only LOAD-BEARING dependencies (a handful, not twenty); stop at bedrock facts, contested-empirical questions, or value premises. Marking a genuinely simple claim atomic is correct — do not decompose a settled claim into how it is proved.
- Statuses: verified / supported / contested / unsupported / contradicted / unknown. Never round a genuinely contested claim up to verified or down to contradicted. CONTESTED requires credible evidence/argument on multiple sides in the live discourse — not merely "someone could quibble".
- Every judgment carries a transparent reasoning trace: what evidence was considered, how competing evidence was weighed, what uncertainties remain. A reader should be able to follow WHY the status was chosen; referring to subclaims by opaque id instead of their text is a readability failure.
- Neutrality: map claims faithfully regardless of valence; represent the strongest version of each major position.
- Importance (0..1): how much rides on getting the claim right — foundational claims many debates turn on ≈0.8+, substantive domain claims ≈0.5-0.7, minor/settled/incidental ≈<0.4. Importance orders the scarce-compute work queue, so settled textbook/bedrock material should NOT outrank live contested questions users actually consult the graph for.`;

export interface JudgeInput {
  id: string;
  text: string;
  claimType: string;
  importance: number;
  status: string | null;
  confidence: number | null;
  reasoningTrace: string | null;
  subclaims: Array<{ relation: string; text: string; status: string | null }>;
}

export interface JudgeVerdict {
  id: string;
  text: string;
  importanceStored: number;
  status: string | null;
  readability: number;
  reasoning_fit: number;
  impartiality: number;
  claim_bar: "yes" | "no";
  decomposition_granularity: "good" | "too_granular" | "too_shallow" | "n_a";
  importance_judged: number;
  flags: string[];
  note: string;
}

const SCHEMA = {
  type: "object" as const,
  properties: {
    readability: { type: "number", description: "1-5: can a reader follow WHY this status was chosen from the trace alone?" },
    reasoning_fit: { type: "number", description: "1-5: does the trace's content justify the chosen status and confidence?" },
    impartiality: { type: "number", description: "1-5: is the reasoning even-handed (weighs counter-evidence, no rounding, no one-sided framing)?" },
    claim_bar: { type: "string", enum: ["yes", "no"], description: "Is the text a genuine CONTESTABLE claim (vs textbook theorem / definitional gloss / uncontestable bedrock)?" },
    decomposition_granularity: {
      type: "string",
      enum: ["good", "too_granular", "too_shallow", "n_a"],
      description: "Are the direct subclaims load-bearing dependencies, over-decomposition of settled material, or missing key dependencies? n_a if atomic.",
    },
    importance_judged: { type: "number", description: "0..1: your independent importance for this claim per the scale above." },
    flags: {
      type: "array",
      items: { type: "string", enum: ["status_miscalibrated", "false_precision", "bias", "hallucination_risk", "boilerplate_trace", "opaque_ids", "other"] },
      description: "Any quality flags that apply.",
    },
    note: { type: "string", description: "One or two sentences: the single most important observation." },
  },
  required: ["readability", "reasoning_fit", "impartiality", "claim_bar", "decomposition_granularity", "importance_judged", "flags", "note"],
};

export async function judgeClaim(input: JudgeInput): Promise<JudgeVerdict> {
  const subs =
    input.subclaims.length > 0
      ? input.subclaims.map((s) => `- [${s.relation}] ${s.text} (status: ${s.status ?? "none"})`).join("\n")
      : "(atomic — no decomposition)";

  const prompt = `You are auditing one claim from a claim-graph maintained by LLM agents. Be concretely critical — this is a quality audit, not a compliment.

${CONSTITUTION_STANDARDS}

## Claim
Text: ${input.text}
Type: ${input.claimType}
Stored importance: ${input.importance}
Assessment status: ${input.status ?? "(none)"} (confidence ${input.confidence ?? "n/a"})

## Reasoning trace
${input.reasoningTrace ?? "(none)"}

## Direct subclaims (${input.subclaims.length})
${subs}

Grade against the standards above and respond with the 'respond' tool.`;

  const model = loadConfig().judgeModel;
  const verdict = await completeStructured<Omit<JudgeVerdict, "id" | "text" | "importanceStored" | "status">>({
    messages: [{ role: "user", content: prompt }],
    schema: SCHEMA,
    schemaName: "ClaimQualityVerdict",
    model,
    // Claude-5 judge models think before answering, and thinking counts against
    // max_tokens — too low a budget is spent thinking and never emits the
    // respond tool. Give comfortable headroom for a small JSON verdict.
    maxTokens: 4096,
  });

  return {
    id: input.id,
    text: input.text,
    importanceStored: input.importance,
    status: input.status,
    ...verdict,
  };
}
