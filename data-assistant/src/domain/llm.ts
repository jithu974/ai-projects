export interface LlmGenerateRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxOutputTokens: number;
}

export interface LlmTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmGenerateResponse {
  text: string;
  provider: string;
  model: string;
  finishReason: string;
  usage: LlmTokenUsage;
  latencyMs: number;
}

export interface ILlmProvider {
  readonly providerName: string;
  readonly modelName: string;
  generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse>;
}