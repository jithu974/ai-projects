import { describe, expect, it, vi } from 'vitest';
import { buildServer } from '../../../src/api/server.js';
import { AskQuestionUseCase } from '../../../src/application/ask-question.js';
import type { IRetriever } from '../../../src/domain/rag.js';
import { ContextBuilder } from '../../../src/generation/context-builder.js';
import { PromptBuilder } from '../../../src/generation/prompt-builder.js';
import { LlmService } from '../../../src/infrastructure/llm/llm.service.js';
import { MockLlmProvider } from '../../../src/infrastructure/llm/mock.llm-provider.js';
import { Cl100kTokenizer } from '../../../src/ingestion/chunking/tokenizer.js';
import { loadConfig } from '../../../src/shared/config.js';

const testConfig = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/data_assistant',
  REDIS_URL: 'redis://127.0.0.1:6379/0',
  QDRANT_URL: 'https://example.cloud.qdrant.io:6333',
  LLM_PROVIDER: 'mock',
  LLM_MODEL: 'mock-grounded-v1',
});

describe('POST /api/v1/ask', () => {
  const tokenizer = new Cl100kTokenizer(500);

  it('returns 400 VALIDATION_ERROR when x-tenant-id header is missing or invalid', async () => {
    const fakeRetriever: IRetriever = { execute: vi.fn() };
    const askUseCase = new AskQuestionUseCase(
      fakeRetriever,
      new ContextBuilder(tokenizer),
      new PromptBuilder(),
      new LlmService(new MockLlmProvider(), { timeoutMs: 2000, maxRetries: 0 }),
      {
        defaultTopK: 5,
        minSimilarityScore: 0.15,
        maxContextTokens: 1800,
        temperature: 0.1,
        maxOutputTokens: 256,
        allowDebugExposure: true,
      },
    );

    const app = buildServer({ config: testConfig, healthChecks: [], askQuestionUseCase: askUseCase });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ask',
      payload: { question: 'What is our annual leave policy?' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('returns 200 grounded response via MockLlmProvider', async () => {
    const fakeRetriever: IRetriever = {
      execute: vi.fn(async (req: Parameters<IRetriever['execute']>[0]) => ({
        query: req.query,
        model: 'deterministic-hash-v1',
        dimensions: 384,
        embeddingCacheHit: true,
        latencyMs: 8,
        results: [
          {
            chunkId: 'c1',
            score: 0.42,
            documentId: 'd1',
            versionId: 'v1',
            documentTitle: 'Employee Handbook',
            mimeType: 'text/markdown',
            pageNumber: 1,
            pageEndNumber: 1,
            headingPath: ['Annual Leave Policy'],
            chunkType: 'text',
            content: 'Full-time employees receive 30 days of paid annual leave after 3 years.',
          },
        ],
      } satisfies Awaited<ReturnType<IRetriever['execute']>>)),
    };

    const askUseCase = new AskQuestionUseCase(
      fakeRetriever,
      new ContextBuilder(tokenizer),
      new PromptBuilder(),
      new LlmService(new MockLlmProvider(), { timeoutMs: 2000, maxRetries: 0 }),
      {
        defaultTopK: 5,
        minSimilarityScore: 0.15,
        maxContextTokens: 1800,
        temperature: 0.1,
        maxOutputTokens: 256,
        allowDebugExposure: true,
      },
    );

    const app = buildServer({ config: testConfig, healthChecks: [], askQuestionUseCase: askUseCase });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ask',
      headers: { 'x-tenant-id': '11111111-1111-4111-8111-111111111111' },
      payload: { question: 'What is the annual leave entitlement?', includeDebug: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.grounded).toBe(true);
    expect(body.abstained).toBe(false);
    expect(body.answer).toContain('30 days');
    expect(body.debug.userPrompt).toContain('<context>');
    await app.close();
  });
});