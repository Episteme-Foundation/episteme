export class BedrockBudgetExceededError extends Error {
  public readonly limitType: string;
  public readonly currentValue: number;
  public readonly limitValue: number;

  constructor(limitType: string, currentValue: number, limitValue: number) {
    super(
      `Bedrock budget exceeded: ${limitType} = ${currentValue} (limit: ${limitValue})`
    );
    this.name = "BedrockBudgetExceededError";
    this.limitType = limitType;
    this.currentValue = currentValue;
    this.limitValue = limitValue;
  }
}
