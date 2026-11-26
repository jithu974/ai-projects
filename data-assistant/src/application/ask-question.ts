import type { ChunkContentType } from '../domain/chunk.js';
import type { SupportedMimeType } from '../domain/document.js';
import type { AskQuestionResult, IRetriever } from '../domain/rag.js';
import type { ContextBuilder } from '../generation/context-builder.js';
import {
  INSUFFICIENT_EVIDENCE_SENTINEL,
  type PromptBuilder,
} from '../generation/prompt-builder.js';
import type { LlmService } from '../infrastructure/llm/llm.service.js';

const NO_CONTEXT_MESSAGE =
  'I could not find relevant information in the uploaded company documents to answer this question.';

const INSUFFICIENT_EVIDENCE_MESSAGE =
  'The retrieved company documents do not contain enough evidence to answer this question reliably.';

export interface AskQuestionFilters {
  documentIds?: readonly string[] | undefined;
  mimeTypes?: readonly SupportedMimeType[] | undefined;
  chunkTypes?: readonly ChunkContentType[] | undefined;
}

export interface AskQuestionRequest {
  tenantId: string;
  question: string;
  topK?: number | undefined;
  scoreThreshold?: number | undefined;
  filters?: AskQuestionFilters | undefined;
  documentIds?: readonly string[] | undefined;
  mimeTypes?: readonly SupportedMimeType[] | undefined;
  chunkTypes?: readonly ChunkContentType[] | undefined;
  includeDebug?: boolean | undefined;
}

export interface AskQuestionDefaults {
  defaultTopK: number;
  minSimilarityScore: number;
  maxContextTokens: number;
  temperature: number;
  maxOutputTokens: number;
  allowDebugExposure: boolean;
}

export class AskQuestionUseCase {
  constructor(
    private readonly retriever: IRetriever,
    private readonly contextBuilder: ContextBuilder,
    private readonly promptBuilder: PromptBuilder,
    private readonly llmService: LlmService,
    private readonly defaults: AskQuestionDefaults,
  ) {}

  async execute(input: AskQuestionRequest): Promise<AskQuestionResult> {
    const totalStart = performance.now();

    const topK = input.topK ?? this.defaults.defaultTopK;
    const scoreThreshold = input.scoreThreshold ?? this.defaults.minSimilarityScore;
    const shouldIncludeDebug = Boolean(input.includeDebug) && this.defaults.allowDebugExposure;

    const documentIds = input.filters?.documentIds ?? input.documentIds;
    const mimeTypes = input.filters?.mimeTypes ?? input.mimeTypes;
    const chunkTypes = input.filters?.chunkTypes ?? input.chunkTypes;

    // Step 1: Retrieve tenant-scoped active chunks above similarity threshold
    const retrievalStart = performance.now();
    const retrieval = await this.retriever.execute({
      tenantId: input.tenantId,
      query: input.question,
      topK,
      scoreThreshold,
      documentIds,
      mimeTypes,
      chunkTypes,
    });
    const retrievalMs = Math.round(performance.now() - retrievalStart);

    // Gate 1 (Pre-LLM Abstention): No relevant chunks found -> abstain without calling LLM
    if (retrieval.results.length === 0) {
      return {
        question: input.question,
        answer: NO_CONTEXT_MESSAGE,
        grounded: false,
        abstained: true,
        abstentionReason: 'NO_RELEVANT_CONTEXT',
        sources: [],
        model: {
          provider: this.llmService.providerName,
          name: this.llmService.modelName,
          llmCalled: false,
        },
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        timingsMs: {
          retrieval: retrievalMs,
          generation: 0,
          total: Math.round(performance.now() - totalStart),
        },
        ...(shouldIncludeDebug
          ? {
              debug: {
                systemPrompt: '',
                userPrompt: '',
                retrievedChunks: [],
                droppedChunksCount: 0,
                contextTokens: 0,
              },
            }
          : {}),
      };
    }

    // Step 2: Build token-budgeted, deduplicated context
    const builtContext = this.contextBuilder.build(
      retrieval.results,
      this.defaults.maxContextTokens,
    );

    if (builtContext.sources.length === 0) {
      return {
        question: input.question,
        answer: NO_CONTEXT_MESSAGE,
        grounded: false,
        abstained: true,
        abstentionReason: 'NO_RELEVANT_CONTEXT',
        sources: [],
        model: {
          provider: this.llmService.providerName,
          name: this.llmService.modelName,
          llmCalled: false,
        },
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        timingsMs: {
          retrieval: retrievalMs,
          generation: 0,
          total: Math.round(performance.now() - totalStart),
        },
      };
    }

    // Step 3: Construct strictly delimited grounded prompt
    const prompt = this.promptBuilder.buildGroundedQaPrompt({
      question: input.question,
      formattedContext: builtContext.formattedContext,
    });

    // Step 4: Invoke free-tier LLM via resilient LlmService
    const generationStart = performance.now();
    const llmResponse = await this.llmService.generate({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      temperature: this.defaults.temperature,
      maxOutputTokens: this.defaults.maxOutputTokens,
    });
    const generationMs = Math.round(performance.now() - generationStart);

    // Gate 2 (Post-LLM Abstention): Detect explicit INSUFFICIENT_EVIDENCE sentinel
    const trimmedAnswer = llmResponse.text.trim();
    const llmAbstained =
      trimmedAnswer.length === 0 ||
      trimmedAnswer.toUpperCase() === INSUFFICIENT_EVIDENCE_SENTINEL ||
      trimmedAnswer.toUpperCase().startsWith(INSUFFICIENT_EVIDENCE_SENTINEL);

    return {
      question: input.question,
      answer: llmAbstained ? INSUFFICIENT_EVIDENCE_MESSAGE : trimmedAnswer,
      grounded: !llmAbstained,
      abstained: llmAbstained,
      abstentionReason: llmAbstained ? 'INSUFFICIENT_EVIDENCE' : null,
      sources: builtContext.sources,
      model: {
        provider: llmResponse.provider,
        name: llmResponse.model,
        llmCalled: true,
      },
      usage: llmResponse.usage,
      timingsMs: {
        retrieval: retrievalMs,
        generation: generationMs,
        total: Math.round(performance.now() - totalStart),
      },
      ...(shouldIncludeDebug
        ? {
            debug: {
              systemPrompt: prompt.systemPrompt,
              userPrompt: prompt.userPrompt,
              retrievedChunks: retrieval.results,
              droppedChunksCount: builtContext.droppedChunksCount,
              contextTokens: builtContext.totalContextTokens,
            },
          }
        : {}),
    };
  }
}