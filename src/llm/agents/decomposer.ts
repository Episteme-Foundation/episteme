import type Anthropic from "@anthropic-ai/sdk";
type Tool = Anthropic.Tool;
import { completeStructured, toolUseLoop } from "../client.js";
import {
  getDecomposerSystemPrompt,
  getDecompositionPrompt,
} from "../prompts/decomposer.js";
import {
  getGraphToolDefinitions,
  executeGraphTool,
} from "../tools/graph-tools.js";

export interface SubClaimResult {
  text: string;
  relation: string;
  reasoning: string;
  confidence: number;
  existing_claim_id: string | null;
  is_atomic: boolean;
  atomic_type: string | null;
  argument_name: string | null;
}

export interface ArgumentResult {
  name: string;
  stance: string;
  description: string;
}

export interface DecompositionResult {
  is_atomic: boolean;
  atomic_type: string | null;
  subclaims: SubClaimResult[];
  arguments: ArgumentResult[];
  reasoning_summary: string;
}

const DECOMPOSITION_RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    is_atomic: { type: "boolean", description: "Whether the claim is atomic" },
    atomic_type: { type: ["string", "null"], description: "If atomic: bedrock_fact, contested_empirical, or value_premise" },
    subclaims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "The subclaim's canonical form" },
          relation: { type: "string", description: "Relationship type: requires, supports, contradicts, specifies, defines, presupposes" },
          reasoning: { type: "string", description: "Why this is a valid decomposition" },
          confidence: { type: "number", description: "Confidence in this decomposition (0.0-1.0)" },
          existing_claim_id: { type: ["string", "null"], description: "UUID of matching existing claim" },
          is_atomic: { type: "boolean", description: "Whether this subclaim is atomic" },
          atomic_type: { type: ["string", "null"], description: "If atomic: bedrock_fact, contested_empirical, or value_premise" },
          argument_name: { type: ["string", "null"], description: "Name of the argument this subclaim belongs to (if applicable)" },
        },
        required: ["text", "relation", "reasoning", "confidence"],
      },
    },
    arguments: {
      type: "array",
      description: "Distinct arguments (lines of reasoning) identified",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short descriptive name for this argument" },
          stance: { type: "string", enum: ["for", "against", "neutral"], description: "Whether this argument supports, opposes, or is neutral" },
          description: { type: "string", description: "Brief description of this line of reasoning" },
        },
        required: ["name", "stance", "description"],
      },
    },
    reasoning_summary: { type: "string", description: "Overall explanation of the decomposition" },
  },
  required: ["is_atomic", "reasoning_summary"],
};

/**
 * Decompose a claim into subclaims. Uses tool use to search for existing claims.
 */
export async function decomposeClaim(input: {
  claimText: string;
  claimType: string;
  context?: string;
  useTools?: boolean;
  model?: string;
}): Promise<DecompositionResult> {
  const userPrompt = getDecompositionPrompt(
    input.claimText,
    input.claimType,
    input.context
  );

  if (input.useTools !== false) {
    return decomposeWithTools(userPrompt, input.model);
  }
  return decomposeWithoutTools(userPrompt, input.model);
}

async function decomposeWithTools(
  userPrompt: string,
  model?: string
): Promise<DecompositionResult> {
  const graphTools = getGraphToolDefinitions();
  const submitTool: Tool = {
    name: "submit_decomposition",
    description: "Submit the final decomposition result",
    input_schema: DECOMPOSITION_RESPONSE_SCHEMA as Tool["input_schema"],
  };

  let finalResult: DecompositionResult | null = null;

  const result = await toolUseLoop({
    initialMessages: [{ role: "user", content: userPrompt }],
    tools: [...graphTools, submitTool],
    system: getDecomposerSystemPrompt(),
    model,
    maxTokens: 8192,
    maxIterations: 5,
    executeTool: async (name, toolInput) => {
      if (name === "submit_decomposition") {
        finalResult = toolInput as unknown as DecompositionResult;
        return JSON.stringify({ success: true });
      }
      return executeGraphTool(name, toolInput);
    },
    onFinalTool: (name, toolInput) => {
      if (name === "submit_decomposition") {
        finalResult = toolInput as unknown as DecompositionResult;
        return finalResult;
      }
      return null;
    },
  });

  if (finalResult) return finalResult;

  // Fallback: try to parse from text
  return {
    is_atomic: false,
    atomic_type: null,
    subclaims: [],
    arguments: [],
    reasoning_summary: result.content || "Decomposition completed without structured output",
  };
}

async function decomposeWithoutTools(
  userPrompt: string,
  model?: string
): Promise<DecompositionResult> {
  return completeStructured<DecompositionResult>({
    messages: [{ role: "user", content: userPrompt }],
    schema: DECOMPOSITION_RESPONSE_SCHEMA,
    schemaName: "DecompositionResponse",
    system: getDecomposerSystemPrompt(),
    model,
    maxTokens: 8192,
  });
}
