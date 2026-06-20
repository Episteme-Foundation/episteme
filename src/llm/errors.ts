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
