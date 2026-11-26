import { describe, expect, it, vi } from 'vitest';
import { AskQuestionUseCase } from '../../../src/application/ask-question.js';
import type { ILlmProvider } from '../../../src/domain/llm.js';
import type { IRetriever, RetrievedChunk } from '../../../src/domain/rag.js';
import { ContextBuilder } from '../../../src/generation/context-builder.js';
import {
  INSUFFICIENT_EVIDENCE_SENTINEL,
  PromptBuilder,
} from '../../../src/generation/prompt-builder.js';
import { LlmService } from '../../../src/infrastructure/llm/llm.service.js';
import { Cl100kTokenizer } from '../../../src/ingestion/chunking/tokenizer.js';

const sampleChunks: RetrievedChunk[] = [
  {
    chunkId: 'chunk-1',
    score: 0.48,
    documentId: 'doc-1',
    versionId: 'ver-1',
    documentTitle: 'Employee Handbook',
    mimeType: 'text/markdown',
    pageNumber: 1,
    pageEndNumber: 1,
    headingPath: ['Annual Leave Policy', 'Entitlement by Tenure'],
    chunkType: 'table',
    content: '| Tenure | Annual Days |\n|---|---|\n| 0-2 years | 25 |\n| 3+ years | 30 |',
  },
  {
    chunkId: 'chunk-2',
    score: 0.41,
    documentId: 'doc-1',
    versionId: 'ver-1',
    documentTitle: 'Employee Handbook',
    mimeType: 'text/markdown',
    pageNumber: 2,
    pageEndNumber: 2,
    headingPath: ['Annual Leave Policy', 'Contractors'],
    chunkType: 'text',
    content: 'External contractors are not eligible for paid annual leave.',
  },
];

describe('ContextBuilder & PromptBuilder', () => {
  const tokenizer = new Cl100kTokenizer(1000);
  const contextBuilder = new ContextBuilder(tokenizer);
  const promptBuilder = new PromptBuilder();

  it('deduplicates identical chunks and enforces maxContextTokens budget', () => {
    const duplicate = { ...sampleChunks[0]!, chunkId: 'chunk-dup' };
    const built = contextBuilder.build([sampleChunks[0]!, duplicate, sampleChunks[1]!], 65);

    // Duplicate is dropped; tight 65-token budget keeps S1 and drops S2
    expect(built.sources).toHaveLength(1);
    expect(built.sources[0]?.sourceLabel).toBe('S1');
    expect(built.droppedChunksCount).toBe(2);
    expect(built.totalContextTokens).toBeLessThanOrEqual(65);
  });

  it('builds delimited XML context/question prompt with grounding rules', () => {
    const prompt = promptBuilder.buildGroundedQaPrompt({
      question: 'How many leave days do senior staff receive?',
      formattedContext: '[S1] Document: Employee Handbook | Page 1\n3+ years: 30 days',
    });

    expect(prompt.systemPrompt).toContain(INSUFFICIENT_EVIDENCE_SENTINEL);
    expect(prompt.systemPrompt).toContain('untrusted reference data');
    expect(prompt.userPrompt).toContain('<context>');
    expect(prompt.userPrompt).toContain('<question>');
  });
});

describe('LlmService Resilience', () => {
  it('retries HTTP 429 rate limits and recovers', async () => {
    let calls = 0;
    const provider: ILlmProvider = {
      providerName: 'mock-gemini',
      modelName: 'gemini-3.5-flash-lite',
      generate: vi.fn(async () => {
        calls += 1;
        if (calls < 2) {
          throw Object.assign(new Error('429 RESOURCE_EXHAUSTED'), { status: 429 });
        }
        return {
          text: 'Employees with 3+ years receive 30 days [S1].',
          provider: 'mock-gemini',
          model: 'gemini-3.5-flash-lite',
          finishReason: 'STOP',
          usage: { promptTokens: 50, completionTokens: 12, totalTokens: 62 },
          latencyMs: 120,
        };
      }),
    };

    const service = new LlmService(provider, {
      timeoutMs: 2000,
      maxRetries: 2,
      retryBaseDelayMs: 5,
    });

    const res = await service.generate({
      systemPrompt: 'sys',
      userPrompt: 'usr',
      temperature: 0.1,
      maxOutputTokens: 100,
    });

    expect(calls).toBe(2);
    expect(res.text).toContain('30 days');
  });

  it('fails fast on HTTP 401 unauthorized without retrying', async () => {
    const generate = vi.fn(async () => {
      throw Object.assign(new Error('Invalid API key'), { status: 401 });
    });

    const service = new LlmService(
      { providerName: 'mock-groq', modelName: 'openai/gpt-oss-20b', generate },
      { timeoutMs: 2000, maxRetries: 3, retryBaseDelayMs: 5 },
    );

    await expect(
      service.generate({ systemPrompt: 's', userPrompt: 'u', temperature: 0.1, maxOutputTokens: 50 }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'DEPENDENCY_UNAVAILABLE' });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe('AskQuestionUseCase (Grounded Answer & Dual Abstention Gates)', () => {
  const tokenizer = new Cl100kTokenizer(1000);
  const contextBuilder = new ContextBuilder(tokenizer);
  const promptBuilder = new PromptBuilder();

  const makeRetriever = (results: RetrievedChunk[]): IRetriever => ({
    execute: vi.fn(async (req) => ({
      query: req.query,
      model: 'deterministic-hash-v1',
      dimensions: 384,
      embeddingCacheHit: false,
      latencyMs: 10,
      results,
    })),
  });

  it('returns grounded answer and dev debug payload when evidence exists', async () => {
    const generate = vi.fn(async () => ({
      text: 'Employees with 3+ years tenure receive 30 annual leave days [S1].',
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      finishReason: 'STOP',
      usage: { promptTokens: 110, completionTokens: 15, totalTokens: 125 },
      latencyMs: 240,
    }));

    const useCase = new AskQuestionUseCase(
      makeRetriever(sampleChunks),
      contextBuilder,
      promptBuilder,
      new LlmService({ providerName: 'gemini', modelName: 'gemini-3.5-flash-lite', generate }, { timeoutMs: 2000, maxRetries: 0 }),
      {
        defaultTopK: 5,
        minSimilarityScore: 0.15,
        maxContextTokens: 1800,
        temperature: 0.1,
        maxOutputTokens: 512,
        allowDebugExposure: true,
      },
    );

    const res = await useCase.execute({
      tenantId: '11111111-1111-4111-8111-111111111111',
      question: 'How many annual leave days do 3+ year employees get?',
      includeDebug: true,
    });

    expect(res.grounded).toBe(true);
    expect(res.abstained).toBe(false);
    expect(res.model.llmCalled).toBe(true);
    expect(res.sources).toHaveLength(2);
    expect(res.debug?.userPrompt).toContain('<context>');
    expect(res.debug?.retrievedChunks).toHaveLength(2);
  });

  it('Gate 1: abstains early (NO_RELEVANT_CONTEXT) without calling the LLM when 0 chunks match', async () => {
    const generate = vi.fn();
    const useCase = new AskQuestionUseCase(
      makeRetriever([]),
      contextBuilder,
      promptBuilder,
      new LlmService({ providerName: 'gemini', modelName: 'gemini-3.5-flash-lite', generate }, { timeoutMs: 2000, maxRetries: 0 }),
      {
        defaultTopK: 5,
        minSimilarityScore: 0.15,
        maxContextTokens: 1800,
        temperature: 0.1,
        maxOutputTokens: 512,
        allowDebugExposure: false,
      },
    );

    const res = await useCase.execute({
      tenantId: '11111111-1111-4111-8111-111111111111',
      question: 'What is the chocolate cake recipe?',
      includeDebug: true,
    });

    expect(res.abstained).toBe(true);
    expect(res.grounded).toBe(false);
    expect(res.abstentionReason).toBe('NO_RELEVANT_CONTEXT');
    expect(res.model.llmCalled).toBe(false);
    expect(res.debug).toBeUndefined();
    expect(generate).not.toHaveBeenCalled();
  });

  it('Gate 2: abstains cleanly when LLM returns INSUFFICIENT_EVIDENCE', async () => {
    const generate = vi.fn(async () => ({
      text: INSUFFICIENT_EVIDENCE_SENTINEL,
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      finishReason: 'stop',
      usage: { promptTokens: 90, completionTokens: 4, totalTokens: 94 },
      latencyMs: 95,
    }));

    const useCase = new AskQuestionUseCase(
      makeRetriever([sampleChunks[0]!]),
      contextBuilder,
      promptBuilder,
      new LlmService({ providerName: 'groq', modelName: 'openai/gpt-oss-20b', generate }, { timeoutMs: 2000, maxRetries: 0 }),
      {
        defaultTopK: 5,
        minSimilarityScore: 0.15,
        maxContextTokens: 1800,
        temperature: 0.1,
        maxOutputTokens: 512,
        allowDebugExposure: false,
      },
    );

    const res = await useCase.execute({
      tenantId: '11111111-1111-4111-8111-111111111111',
      question: 'What is our paternity leave duration?',
    });

    expect(res.abstained).toBe(true);
    expect(res.grounded).toBe(false);
    expect(res.abstentionReason).toBe('INSUFFICIENT_EVIDENCE');
    expect(res.model.llmCalled).toBe(true);
    expect(res.answer).toContain('do not contain enough evidence');
  });
});