import Groq from 'groq-sdk';
import type {
  ILlmProvider,
  LlmGenerateRequest,
  LlmGenerateResponse,
} from '../../domain/llm.js';

export class GroqLlmProvider implements ILlmProvider {
  public readonly providerName = 'groq';
  private readonly client: Groq;

  constructor(
    apiKey: string,
    public readonly modelName: string,
    timeoutMs: number,
  ) {
    // Disable built-in SDK retries so LlmService manages backoff, jitter, and logging centrally
    this.client = new Groq({
      apiKey,
      maxRetries: 0,
      timeout: timeoutMs,
    });
  }

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    const startedAt = performance.now();

    const completion = await this.client.chat.completions.create({
      model: this.modelName,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      temperature: request.temperature,
      max_completion_tokens: request.maxOutputTokens,
    });

    const choice = completion.choices[0];
    const text = (choice?.message?.content ?? '').trim();
    const promptTokens = completion.usage?.prompt_tokens ?? 0;
    const completionTokens = completion.usage?.completion_tokens ?? 0;
    const totalTokens = completion.usage?.total_tokens ?? promptTokens + completionTokens;

    return {
      text,
      provider: this.providerName,
      model: completion.model || this.modelName,
      finishReason: choice?.finish_reason ?? 'unknown',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}