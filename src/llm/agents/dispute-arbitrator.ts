/**
 * Dispute Arbitrator agent.
 *
 * Handles escalated reviews, appeals, and complex disputes that require
 * deeper analysis. Acts through tools -- no structured return value.
 */
import { toolUseLoop } from "../client.js";
import { getDisputeArbitratorSystemPrompt } from "../prompts/dispute-arbitrator.js";
import {
  getGovernanceToolDefinitions,
  executeGovernanceTool,
} from "../tools/governance-tools.js";
import {
  getArbitratorToolDefinitions,
  executeArbitratorTool,
} from "../tools/arbitrator-tools.js";
import { loadConfig } from "../../config.js";
import { withAgent } from "../usage-context.js";

// Tag every LLM call in this agent for the per-token meter (#70); the
// wrapper keeps attribution correct for any call site.
export function runArbitration(
  input: Parameters<typeof runArbitrationImpl>[0]
): ReturnType<typeof runArbitrationImpl> {
  return withAgent("dispute_arbitrator", () => runArbitrationImpl(input));
}

async function runArbitrationImpl(input: {
  contributionId: string;
  trigger: string;
  appealId?: string;
  model?: string;
}): Promise<void> {
  const config = loadConfig();
  // Arbitration is the highest-stakes governance call, so it has its own model
  // knob (ARBITRATION_MODEL) rather than sharing governanceModel with the
  // reviewer and auditor. Production sets this to Opus 4.8.
  const model = input.model ?? config.arbitrationModel;

  const tools = [
    ...getGovernanceToolDefinitions(),
    ...getArbitratorToolDefinitions(),
  ];

  let userMessage = `You have been called to arbitrate a dispute.

Trigger: ${input.trigger}
Contribution ID: ${input.contributionId}`;

  if (input.appealId) {
    userMessage += `\nAppeal ID: ${input.appealId}`;
  }

  userMessage += `

Gather the full record with your read tools, decide, and record the outcome
with record_arbitration_decision (pass the appeal ID above, if any).`;

  await toolUseLoop({
    initialMessages: [{ role: "user", content: userMessage }],
    tools,
    system: getDisputeArbitratorSystemPrompt(),
    model,
    maxTokens: 8192,
    maxIterations: 12,
    executeTool: async (name, toolInput) => {
      const governanceTools = getGovernanceToolDefinitions().map((t) => t.name);
      if (governanceTools.includes(name)) {
        return executeGovernanceTool(name, toolInput);
      }
      return executeArbitratorTool(name, toolInput);
    },
  });
}
