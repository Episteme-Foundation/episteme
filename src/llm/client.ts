import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import type Anthropic from "@anthropic-ai/sdk";

type MessageParam = Anthropic.MessageParam;
type ContentBlock = Anthropic.ContentBlock;
type ToolUseBlock = Anthropic.ToolUseBlock;
type TextBlock = Anthropic.TextBlock;
type Tool = Anthropic.Tool;
type ToolResultBlockParam = Anthropic.ToolResultBlockParam;
import { loadConfig } from "../config.js";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface CompletionResult {
  content: string;
  model: string;
  usage: TokenUsage;
  stopReason: string | null;
}

export interface ToolCompletionResult extends CompletionResult {
  toolUses: ToolUse[];
  rawContent: ContentBlock[];
}

let _client: AnthropicBedrock | null = null;

function getBedrockClient(): AnthropicBedrock {
  if (_client) return _client;
  const config = loadConfig();
  _client = new AnthropicBedrock({ awsRegion: config.awsRegion });
  return _client;
}

const DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-20250514";

export async function complete(options: {
  messages: MessageParam[];
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: Tool[];
}): Promise<CompletionResult> {
  const client = getBedrockClient();
  const model = options.model ?? DEFAULT_MODEL;

  const response = await client.messages.create({
    model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0,
    ...(options.system ? { system: options.system } : {}),
    ...(options.tools ? { tools: options.tools } : {}),
  });

  const usage: TokenUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  let content = "";
  for (const block of response.content) {
    if (block.type === "text") {
      content += (block as TextBlock).text;
    }
  }

  return { content, model, usage, stopReason: response.stop_reason };
}

export async function completeWithTools(options: {
  messages: MessageParam[];
  tools: Tool[];
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<ToolCompletionResult> {
  const client = getBedrockClient();
  const model = options.model ?? DEFAULT_MODEL;

  const response = await client.messages.create({
    model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0,
    tools: options.tools,
    ...(options.system ? { system: options.system } : {}),
  });

  const usage: TokenUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  let textContent = "";
  const toolUses: ToolUse[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      textContent += (block as TextBlock).text;
    } else if (block.type === "tool_use") {
      const tb = block as ToolUseBlock;
      toolUses.push({
        id: tb.id,
        name: tb.name,
        input: tb.input as Record<string, unknown>,
      });
    }
  }

  return {
    content: textContent,
    model,
    usage,
    stopReason: response.stop_reason,
    toolUses,
    rawContent: response.content,
  };
}

/**
 * Get a structured response by forcing tool use.
 * The model is asked to call a "respond" tool whose input_schema matches the desired shape.
 */
export async function completeStructured<T>(options: {
  messages: MessageParam[];
  schema: Record<string, unknown>;
  schemaName: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<T> {
  const tool: Tool = {
    name: "respond",
    description: `Provide the response as a ${options.schemaName}`,
    input_schema: options.schema as Tool["input_schema"],
  };

  const enhancedSystem = (options.system ?? "") +
    "\n\nYou must use the 'respond' tool to provide your response. Do not respond with plain text.";

  const result = await completeWithTools({
    messages: options.messages,
    tools: [tool],
    system: enhancedSystem,
    model: options.model,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  });

  if (result.toolUses.length === 0) {
    throw new Error("Model did not use the respond tool");
  }

  return result.toolUses[0]!.input as T;
}

/**
 * Get a structured list response by forcing tool use with an items wrapper.
 */
export async function completeStructuredList<T>(options: {
  messages: MessageParam[];
  itemSchema: Record<string, unknown>;
  schemaName: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<T[]> {
  const wrapperSchema = {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        items: options.itemSchema,
      },
    },
    required: ["items"],
  };

  const result = await completeStructured<{ items: T[] }>({
    messages: options.messages,
    schema: wrapperSchema,
    schemaName: `ListOf${options.schemaName}`,
    system: options.system,
    model: options.model,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  });

  return result.items;
}

/**
 * Run a multi-turn tool-use loop. Calls the model, executes tools, feeds results back.
 * Continues until the model stops calling tools or maxIterations is reached.
 */
export async function toolUseLoop(options: {
  initialMessages: MessageParam[];
  tools: Tool[];
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  maxIterations?: number;
  executeTool: (name: string, input: Record<string, unknown>) => Promise<string>;
  /** Called when the model calls a "final" tool (e.g. submit_decomposition). Return result to stop loop. */
  onFinalTool?: (name: string, input: Record<string, unknown>) => unknown | null;
}): Promise<ToolCompletionResult> {
  const messages = [...options.initialMessages];
  const maxIter = options.maxIterations ?? 5;
  let lastResult: ToolCompletionResult | null = null;

  for (let i = 0; i < maxIter; i++) {
    const result = await completeWithTools({
      messages,
      tools: options.tools,
      system: options.system,
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });

    lastResult = result;

    if (result.stopReason === "end_turn" || result.toolUses.length === 0) {
      return result;
    }

    // Check for final tool
    if (options.onFinalTool) {
      for (const tu of result.toolUses) {
        const finalResult = options.onFinalTool(tu.name, tu.input);
        if (finalResult !== null && finalResult !== undefined) {
          return result;
        }
      }
    }

    // Execute tools and build tool_result messages
    const toolResults: ToolResultBlockParam[] = [];
    for (const tu of result.toolUses) {
      const output = await options.executeTool(tu.name, tu.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: output,
      });
    }

    // Append assistant message and tool results
    messages.push({ role: "assistant", content: result.rawContent });
    messages.push({ role: "user", content: toolResults });
  }

  return lastResult!;
}
