import { GoogleGenAI } from '@google/genai';
import type {
  ILlmProvider,
  LlmGenerateRequest,
  LlmGenerateResponse,
} from '../../domain/llm.js';

export class GeminiLlmProvider implements ILlmProvider {
  public readonly providerName = 'gemini';
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    public readonly modelName: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    const startedAt = performance.now();

    const response = await this.client.models.generateContent({
      model: this.modelName,
      contents: request.userPrompt,
      config: {
        systemInstruction: request.systemPrompt,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
      },
    });

    const text = (response.text ?? '').trim();
    const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
    const totalTokens = response.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens;
    const finishReason = response.candidates?.[0]?.finishReason ?? 'UNKNOWN';

    return {
      text,
      provider: this.providerName,
      model: this.modelName,
      finishReason: String(finishReason),
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}