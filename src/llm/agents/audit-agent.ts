/**
 * Audit Agent.
 *
 * Reviews decisions for quality, consistency, and policy compliance.
 * The quality control layer that ensures the governance system is working
 * correctly. Acts through tools -- no structured return value.
 */
import { toolUseLoop } from "../client.js";
import { getAuditAgentSystemPrompt } from "../prompts/audit-agent.js";
import {
  getGovernanceToolDefinitions,
  executeGovernanceTool,
} from "../tools/governance-tools.js";
import {
  getAuditToolDefinitions,
  executeAuditTool,
} from "../tools/audit-tools.js";
import { loadConfig } from "../../config.js";
import { withAgent } from "../usage-context.js";

// Tag every LLM call in this agent for the per-token meter (#70); the
// wrapper keeps attribution correct for any call site.
export function runAudit(
  input: Parameters<typeof runAuditImpl>[0]
): ReturnType<typeof runAuditImpl> {
  return withAgent("audit", () => runAuditImpl(input));
}

async function runAuditImpl(input: {
  auditType: string;
  context: string;
  model?: string;
}): Promise<void> {
  const config = loadConfig();
  const model = input.model ?? config.auditModel;

  const tools = [
    ...getGovernanceToolDefinitions(),
    ...getAuditToolDefinitions(),
  ];

  const userMessage = `You have been triggered to perform an audit.

Audit Type: ${input.auditType}
Context: ${input.context}`;

  await toolUseLoop({
    initialMessages: [{ role: "user", content: userMessage }],
    tools,
    system: getAuditAgentSystemPrompt(),
    model,
    maxTokens: 8192,
    maxIterations: 10,
    executeTool: async (name, toolInput) => {
      const governanceTools = getGovernanceToolDefinitions().map((t) => t.name);
      if (governanceTools.includes(name)) {
        return executeGovernanceTool(name, toolInput);
      }
      return executeAuditTool(name, toolInput);
    },
  });
}
