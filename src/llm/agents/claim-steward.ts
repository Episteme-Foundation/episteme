/**
 * Claim Steward agent.
 *
 * Owns a claim over time: it ASSESSES the claim it stewards (there is no separate
 * Assessor — see #30), maintains its canonical form and decomposition, integrates
 * accepted contributions, and re-judges as evidence and depended-on claims change.
 * It always has web_search and may traverse the graph. Acts through tools -- no
 * structured return value.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { toolUseLoop } from "../client.js";
import { getClaimStewardSystemPrompt } from "../prompts/claim-steward.js";
import {
  getGovernanceToolDefinitions,
  executeGovernanceTool,
} from "../tools/governance-tools.js";
import {
  getStewardToolDefinitions,
  executeStewardTool,
} from "../tools/steward-tools.js";
import {
  getMatcherToolDefinition,
  executeMatcherTool,
} from "../tools/matcher-tools.js";
import { loadConfig } from "../../config.js";

export async function runClaimSteward(input: {
  trigger: string;
  claimId: string;
  context: string;
  model?: string;
}): Promise<void> {
  const config = loadConfig();
  const model = input.model ?? config.governanceModel;

  // The steward always has web search — it may need fresh external evidence to
  // assess any claim, atomic or compound (#30).
  const webSearchTool: Anthropic.Messages.WebSearchTool20260209 = {
    type: "web_search_20260209",
    name: "web_search",
    max_uses: 5,
  };

  const tools = [
    ...getGovernanceToolDefinitions(),
    ...getStewardToolDefinitions(),
    getMatcherToolDefinition(),
    webSearchTool,
  ];

  const isInitial = input.trigger === "structure_and_assess";

  const structureStep = isInitial
    ? `2. DECOMPOSE the claim (this is its first pass). Identify its load-bearing
   dependencies and the strongest considerations for and against it — a handful,
   not an exhaustive list (see the Decomposition guidance). For EACH dependency,
   FIRST call match_claim to check whether it already exists in the graph (as
   itself, a rewording, or its negation). If it matches, attach the existing
   claim with add_relationship_edge; only if genuinely novel, create it with
   add_decomposition_edge. Never mint a duplicate. If the claim is genuinely
   simple, leave it atomic — do not invent dependencies.`
    : `2. RE-ASSESS in light of what changed. Adjust structure only if you discover a
   genuinely missing load-bearing dependency — and then match_claim FIRST, linking
   an existing claim with add_relationship_edge or creating a new one with
   add_decomposition_edge. Do not re-decompose from scratch.`;

  const userMessage = `You have been triggered to steward a claim.

Trigger: ${input.trigger}
Claim ID: ${input.claimId}
Context: ${input.context}

You OWN this claim — its structure (decomposition) and its assessment. Proceed:
1. Use get_claim_with_context to understand the claim, its subclaims and their
   assessments, its source instances (note each instance's affirm/deny stance),
   and its current assessment if any.
${structureStep}
3. Gauge the claim's importance — use get_claim_dependents to see how many claims
   rely on it. Scale your effort accordingly: foundational claims warrant deeper
   search and a second, adversarial pass; minor claims warrant a light touch.
4. Reach a holistic assessment using your judgment (no mechanical aggregation).
   Use web_search for external evidence where it would change the verdict.
   Credible instances that BOTH affirm and deny the claim are a strong signal
   toward CONTESTED.
5. Record it with update_claim_assessment (always include reasoning).
6. If the canonical form needs improving, use update_canonical_form.
7. Log your decision with log_stewardship_decision.
8. If you established or changed a material assessment, use
   notify_dependent_stewards so claims that depend on this one are re-judged.`;

  await toolUseLoop({
    initialMessages: [{ role: "user", content: userMessage }],
    tools,
    system: getClaimStewardSystemPrompt(),
    model,
    maxTokens: 8192,
    // A pure runaway backstop — judgment, not the iteration count, decides when
    // to stop. The Steward now decomposes AND assesses in one loop, so this is
    // set high; real spend is bounded by stewardMaxRuns + the LLM budget tracker.
    maxIterations: config.stewardMaxIterations,
    executeTool: async (name, toolInput) => {
      if (name === "match_claim") {
        return executeMatcherTool(name, toolInput);
      }
      const governanceTools = getGovernanceToolDefinitions().map((t) => t.name);
      if (governanceTools.includes(name)) {
        return executeGovernanceTool(name, toolInput);
      }
      return executeStewardTool(name, toolInput);
    },
  });
}
