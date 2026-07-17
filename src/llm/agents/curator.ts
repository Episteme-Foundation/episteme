/**
 * Curator agent.
 *
 * The graph-level structure agent (#31): it reconciles claim identity over time —
 * merging duplicates/counterparts the Matcher missed, splitting conflated claims,
 * and suggesting cross-claim edges to the owning Stewards. Agentic tool-use loop;
 * acts through tools, no structured return value.
 */
import { toolUseLoop } from "../client.js";
import { getCuratorSystemPrompt } from "../prompts/curator.js";
import {
  getGraphToolDefinitions,
  executeGraphTool,
} from "../tools/graph-tools.js";
import {
  getClaimContextToolDefinitions,
  executeGovernanceTool,
} from "../tools/governance-tools.js";
import {
  getMatcherToolDefinition,
  executeMatcherTool,
} from "../tools/matcher-tools.js";
import {
  getCuratorToolDefinitions,
  executeCuratorTool,
} from "../tools/curator-tools.js";
import { loadConfig } from "../../config.js";
import { withAgent } from "../usage-context.js";

// Tag every LLM call in this agent for the per-token meter (#70); the
// wrapper keeps attribution correct for any call site.
export function runCurator(
  input: Parameters<typeof runCuratorImpl>[0]
): ReturnType<typeof runCuratorImpl> {
  return withAgent("curator", () => runCuratorImpl(input));
}

async function runCuratorImpl(input: {
  trigger: string;
  claimId: string;
  context: string;
  model?: string;
}): Promise<void> {
  const config = loadConfig();
  const model = input.model ?? config.curatorModel;

  const graphTools = getGraphToolDefinitions();
  // Claim-scoped subset only: the contribution/contributor/decision tools in
  // the full governance bundle are never referenced by the Curator's prompt.
  const claimContextTools = getClaimContextToolDefinitions();
  const curatorTools = getCuratorToolDefinitions();

  const graphNames = new Set(graphTools.map((t) => t.name));
  const claimContextNames = new Set(claimContextTools.map((t) => t.name));

  const tools = [
    ...graphTools,
    ...claimContextTools,
    getMatcherToolDefinition(),
    ...curatorTools,
  ];

  const userMessage = `You have been triggered to curate the graph around a claim.

Trigger: ${input.trigger}
Anchor claim ID: ${input.claimId}
Context: ${input.context}

Start from get_claim_with_context and search_similar_claims, then merge,
split, suggest edges, or leave the structure alone as the evidence warrants.`;

  await toolUseLoop({
    initialMessages: [{ role: "user", content: userMessage }],
    tools,
    system: getCuratorSystemPrompt(),
    model,
    maxTokens: 8192,
    // Backstop only; one reconciliation can take many steps. Total Curator spend
    // is bounded by curatorMaxRuns + the LLM budget tracker.
    maxIterations: 40,
    executeTool: async (name, toolInput) => {
      if (name === "match_claim") return executeMatcherTool(name, toolInput);
      if (graphNames.has(name)) return executeGraphTool(name, toolInput);
      if (claimContextNames.has(name)) return executeGovernanceTool(name, toolInput);
      return executeCuratorTool(name, toolInput);
    },
  });
}
