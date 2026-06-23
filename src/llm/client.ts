import Anthropic from "@anthropic-ai/sdk";

type MessageParam = Anthropic.MessageParam;
type ContentBlock = Anthropic.ContentBlock;
type ToolUseBlock = Anthropic.ToolUseBlock;
type TextBlock = Anthropic.TextBlock;
type Tool = Anthropic.Tool;
type ToolUnion = Anthropic.Messages.ToolUnion;
type ToolResultBlockParam = Anthropic.ToolResultBlockParam;
import { loadConfig } from "../config.js";
import { checkBudget, recordUsage } from "./budget-tracker.js";
import { DEFAULT_MODEL } from "./models.js";

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

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;
  const config = loadConfig();
  _client = new Anthropic({ apiKey: config.anthropicApiKey });
  return _client;
}

// --- Prompt caching --------------------------------------------------------
// The system prompt (constitution + role, several KB and identical across every
// call to a given agent) and the tool schemas are a large, stable prefix. We
// mark them with ephemeral cache_control so repeated calls within the ~5 min
// window reuse the cached prefix — a big cost/latency win in a full corpus run
// (one system prompt, hundreds of claims) and in production. See
// https://platform.claude.com/docs/en/build-with-claude/prompt-caching

/** Print cache hit/miss tokens when LLM_LOG_CACHE is set (verification aid). */
function logCacheUsage(u: Anthropic.Usage): void {
  if (!process.env.LLM_LOG_CACHE) return;
  console.error(
    `[cache] read=${u.cache_read_input_tokens ?? 0} ` +
      `created=${u.cache_creation_input_tokens ?? 0} ` +
      `input=${u.input_tokens} output=${u.output_tokens}`
  );
}

/** Turn a string system prompt into a single cached text block. */
function cachedSystem(
  system: string | undefined
): string | Anthropic.TextBlockParam[] | undefined {
  if (!system) return undefined;
  return [
    { type: "text", text: system, cache_control: { type: "ephemeral" } },
  ];
}

/**
 * Mark the tool list as cacheable by putting cache_control on the LAST tool
 * (the breakpoint caches every preceding tool too). Returns a new array.
 */
function cachedTools(tools: ToolUnion[]): ToolUnion[] {
  if (tools.length === 0) return tools;
  const out = tools.slice();
  const last = out[out.length - 1]!;
  out[out.length - 1] = {
    ...last,
    cache_control: { type: "ephemeral" },
  } as ToolUnion;
  return out;
}

// DEFAULT_MODEL (Claude Sonnet 4.6) lives in ./models.ts — the single source of
// truth for model IDs. Note: the prior Bedrock client used Sonnet 4
// ("claude-sonnet-4-20250514"); this is a deliberate version bump.

export async function complete(options: {
  messages: MessageParam[];
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: ToolUnion[];
}): Promise<CompletionResult> {
  checkBudget();

  const client = getClient();
  const model = options.model ?? DEFAULT_MODEL;

  const response = await client.messages.create({
    model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0,
    ...(options.system ? { system: cachedSystem(options.system) } : {}),
    ...(options.tools ? { tools: cachedTools(options.tools) } : {}),
  });

  const usage: TokenUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  recordUsage(usage.inputTokens, usage.outputTokens);
  logCacheUsage(response.usage);

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
  tools: ToolUnion[];
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<ToolCompletionResult> {
  checkBudget();

  const client = getClient();
  const model = options.model ?? DEFAULT_MODEL;

  const response = await client.messages.create({
    model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0,
    tools: cachedTools(options.tools),
    ...(options.system ? { system: cachedSystem(options.system) } : {}),
  });

  const usage: TokenUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  recordUsage(usage.inputTokens, usage.outputTokens);
  logCacheUsage(response.usage);

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
  serverTools?: ToolUnion[];
}): Promise<T> {
  const tool: Tool = {
    name: "respond",
    description: `Provide the response as a ${options.schemaName}`,
    input_schema: options.schema as Tool["input_schema"],
  };

  const allTools: ToolUnion[] = [tool, ...(options.serverTools ?? [])];

  const enhancedSystem = (options.system ?? "") +
    "\n\nYou must use the 'respond' tool to provide your response. Do not respond with plain text.";

  const result = await completeWithTools({
    messages: options.messages,
    tools: allTools,
    system: enhancedSystem,
    model: options.model,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  });

  // Find the respond tool_use (skip server_tool_use blocks from web search etc.)
  const respondToolUse = result.toolUses.find((tu) => tu.name === "respond");

  if (!respondToolUse) {
    throw new Error("Model did not use the respond tool");
  }

  return respondToolUse.input as T;
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

  if (!Array.isArray(result?.items)) {
    // Almost always means the tool call was truncated at max_tokens, leaving an
    // incomplete/empty input object. Fail with an actionable message instead of
    // a downstream "x is not iterable".
    throw new Error(
      `Structured list "${options.schemaName}" returned no items array — the ` +
        `response was likely truncated at max_tokens (${options.maxTokens ?? 4096}). ` +
        `Increase maxTokens or reduce the input size.`
    );
  }

  return result.items;
}

/**
 * Run a multi-turn tool-use loop. Calls the model, executes tools, feeds results back.
 * Continues until the model stops calling tools or maxIterations is reached.
 */
export async function toolUseLoop(options: {
  initialMessages: MessageParam[];
  tools: ToolUnion[];
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
