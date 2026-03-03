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

export async function runAudit(input: {
  auditType: string;
  context: string;
  model?: string;
}): Promise<void> {
  const config = loadConfig();
  const model = input.model ?? config.governanceModel;

  const tools = [
    ...getGovernanceToolDefinitions(),
    ...getAuditToolDefinitions(),
  ];

  const userMessage = `You have been triggered to perform an audit.

Audit Type: ${input.auditType}
Context: ${input.context}

Please:
1. Use get_recent_decisions to review recent review decisions for patterns.
2. Use get_contribution_details and get_claim_with_context as needed to examine specific cases.
3. Use get_contributor_profile to check contributor patterns.
4. Evaluate decision quality, consistency, and process compliance.
5. Use flag_issue for any problems found, with appropriate severity.
6. Use recommend_re_review if a decision should be re-evaluated.
7. Use adjust_contributor_reputation if patterns warrant reputation changes.
8. Use suspend_contributor for serious or repeated violations that warrant blocking further submissions.
9. Use unsuspend_contributor to restore access for contributors whose suspensions should be lifted.`;

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
