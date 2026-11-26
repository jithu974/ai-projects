import type {
  ILlmProvider,
  LlmGenerateRequest,
  LlmGenerateResponse,
} from '../../domain/llm.js';
import { INSUFFICIENT_EVIDENCE_SENTINEL } from '../../generation/prompt-builder.js';

/**
 * Offline, zero-cost mock LLM for CI and local wiring tests without an external API key.
 * Echoes the top retrieved source excerpt if lexical terms match, otherwise abstains.
 */
export class MockLlmProvider implements ILlmProvider {
  public readonly providerName = 'mock';

  constructor(public readonly modelName = 'mock-grounded-v1') {}

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    const startedAt = performance.now();
    const contextMatch = /<context>([\s\S]*?)<\/context>/.exec(request.userPrompt);
    const questionMatch = /<question>([\s\S]*?)<\/question>/.exec(request.userPrompt);

    const contextText = (contextMatch?.[1] ?? '').trim();
    const questionText = (questionMatch?.[1] ?? '').trim().toLowerCase();

    const keywords = questionText
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4);

    const lowerContext = contextText.toLowerCase();
    const hasMatch = keywords.length > 0 && keywords.some((kw) => lowerContext.includes(kw));

    const firstSourceMatch = /\[S1\][^\n]*\n([\s\S]*?)(?:\n\[S2\]|$)/.exec(contextText);
    const firstExcerpt = (firstSourceMatch?.[1] ?? contextText).trim().slice(0, 320);

    const text =
      hasMatch && firstExcerpt.length > 0
        ? `Based on the provided company documents [S1]: ${firstExcerpt}`
        : INSUFFICIENT_EVIDENCE_SENTINEL;

    return {
      text,
      provider: this.providerName,
      model: this.modelName,
      finishReason: 'STOP',
      usage: {
        promptTokens: Math.ceil((request.systemPrompt.length + request.userPrompt.length) / 4),
        completionTokens: Math.ceil(text.length / 4),
        totalTokens: Math.ceil(
          (request.systemPrompt.length + request.userPrompt.length + text.length) / 4,
        ),
      },
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}