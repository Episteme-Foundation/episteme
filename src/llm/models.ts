/**
 * Single source of truth for Anthropic API model IDs.
 *
 * The LLM client talks to the Anthropic Messages API directly (see client.ts),
 * which only accepts plain IDs like "claude-sonnet-4-6". Bedrock/Vertex-style
 * IDs ("us.anthropic.claude-...") 404 there. Keep every model default here and
 * validate config overrides with isAnthropicModelId so the Bedrock prefix can't
 * silently drift back into the defaults (see issue #11).
 */
export const MODELS = {
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
} as const;

/** Default model for general completions when a caller doesn't specify one. */
export const DEFAULT_MODEL = MODELS.sonnet;

/**
 * True when `id` looks like an Anthropic API model ID (e.g. "claude-sonnet-4-6")
 * rather than a Bedrock/Vertex-prefixed one (e.g. "us.anthropic.claude-...").
 */
export function isAnthropicModelId(id: string): boolean {
  return /^claude-/.test(id);
}
