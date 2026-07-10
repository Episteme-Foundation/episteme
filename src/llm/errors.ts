/**
 * Thrown when the model declines a request (stop_reason "refusal" — an HTTP
 * 200, not an API error). For Fable models the request already retried on the
 * server-side Opus fallback (see client.ts), so seeing this means the whole
 * chain refused. Callers that previously read empty content or got a
 * misleading "Model did not use the respond tool" now fail loudly with the
 * policy category instead.
 */
export class LlmRefusalError extends Error {
  constructor(
    public readonly model: string,
    public readonly category: string | null
  ) {
    super(
      `Model ${model} refused the request` +
        (category ? ` (category: ${category})` : "")
    );
    this.name = "LlmRefusalError";
  }
}

export class LlmBudgetExceededError extends Error {
  public readonly limitType: string;
  public readonly currentValue: number;
  public readonly limitValue: number;

  constructor(limitType: string, currentValue: number, limitValue: number) {
    super(
      `LLM budget exceeded: ${limitType} = ${currentValue} (limit: ${limitValue})`
    );
    this.name = "LlmBudgetExceededError";
    this.limitType = limitType;
    this.currentValue = currentValue;
    this.limitValue = limitValue;
  }
}
