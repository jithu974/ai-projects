import { describe, expect, it } from 'vitest';
import type { NormalizedDocument } from '../../../src/domain/document.js';
import { ChunkerRegistry } from '../../../src/ingestion/chunking/chunker-registry.js';
import { SemanticChunker } from '../../../src/ingestion/chunking/parent-child-sematic.chunkers.js';
import { validateChunkQuality } from '../../../src/ingestion/chunking/quality-validator.js';
import { Cl100kTokenizer } from '../../../src/ingestion/chunking/tokenizer.js';

const sampleDoc: NormalizedDocument = {
  documentId: '22222222-2222-4222-8222-222222222222',
  versionId: '33333333-3333-4333-8333-333333333333',
  tenantId: '11111111-1111-4111-8111-111111111111',
  title: 'Employee Handbook',
  mimeType: 'text/markdown',
  sha256Hash: 'a'.repeat(64),
  parserName: 'utf8-text',
  parserVersion: '1.0.0',
  pageCount: 2,
  totalCharCount: 450,
  normalizedAt: new Date().toISOString(),
  metadata: {},
  pages: [
    {
      pageNumber: 1,
      charCount: 280,
      content: [
        '# Annual Leave Policy',
        'Full-time employees accrue paid annual leave monthly starting on day one.',
        '',
        '## Entitlement by Tenure',
        '| Tenure | Annual Days | Max Carryover |',
        '|---|---|---|',
        '| 0-2 years | 25 | 5 |',
        '| 3+ years | 30 | 10 |',
      ].join('\n'),
    },
    {
      pageNumber: 2,
      charCount: 170,
      content: [
        '## Contractors',
        'External contractors are excluded from paid annual leave.',
        'New hires may use accrued leave during probation with manager approval.',
      ].join('\n'),
    },
  ],
};

describe('Chunking Strategies Comparison', () => {
  const tokenizer = new Cl100kTokenizer(1000);
  const registry = ChunkerRegistry.createDefault(tokenizer);

  it('produces different structures across fixed, sentence, markdown, and parent_child', async () => {
    const opts = { targetTokens: 60, overlapTokens: 10, parentTargetTokens: 180, childTargetTokens: 45 };

    const fixed = await registry.getChunker('fixed').chunk(sampleDoc, opts);
    const sentence = await registry.getChunker('sentence').chunk(sampleDoc, opts);
    const markdown = await registry.getChunker('markdown').chunk(sampleDoc, opts);
    const parentChild = await registry.getChunker('parent_child').chunk(sampleDoc, opts);

    // Markdown preserves heading hierarchy across page 1 -> page 2 and keeps table atomic
    const tableChunk = markdown.find((c) => c.chunkType === 'table');
    expect(tableChunk).toBeDefined();
    expect(tableChunk?.headingPath).toEqual(['Annual Leave Policy', 'Entitlement by Tenure']);
    expect(tableChunk?.content).toContain('| Tenure | Annual Days | Max Carryover |');
    expect(tableChunk?.content).toContain('| 3+ years | 30 | 10 |');

    const contractorChunk = markdown.find((c) => c.content.includes('External contractors'));
    expect(contractorChunk?.pageNumber).toBe(2);
    expect(contractorChunk?.headingPath).toEqual(['Annual Leave Policy', 'Contractors']);
    expect(contractorChunk?.contextualContent).toContain('Employee Handbook > Annual Leave Policy > Contractors');

    // Parent-child links every child to an existing parent ID
    const parents = parentChild.filter((c) => c.chunkLevel === 'parent');
    const children = parentChild.filter((c) => c.chunkLevel === 'child');
    const parentIds = new Set(parents.map((p) => p.id));
    expect(parents.length).toBeGreaterThan(0);
    expect(children.length).toBeGreaterThanOrEqual(parents.length);
    expect(children.every((c) => c.parentChunkId && parentIds.has(c.parentChunkId))).toBe(true);

    // Fixed & sentence strategies omit heading hierarchy
    expect(fixed.every((c) => c.headingPath.length === 0)).toBe(true);
    expect(sentence.length).toBeGreaterThan(0);
  });

  it('splits on topic shifts using SemanticChunker with injectable embeddings', async () => {
    // Orthogonal vectors simulate a sharp topic shift between sentence 1 and sentence 2
    const semantic = new SemanticChunker(
      tokenizer,
      async (sentences) => sentences.map((s) => (s.includes('contractors') ? [0, 1] : [1, 0])),
      0.7,
    );
    const chunks = await semantic.chunk(sampleDoc, { targetTokens: 200, overlapTokens: 0 });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Chunk Quality Validator (All 6 Defect Classes)', () => {
  const tokenizer = new Cl100kTokenizer(1000);
  const registry = ChunkerRegistry.createDefault(tokenizer);

  it('passes cleanly on well-formed Markdown-Aware chunks', async () => {
    const chunks = await registry
      .getChunker('markdown')
      .chunk(sampleDoc, { targetTokens: 120, overlapTokens: 10 });
    const report = validateChunkQuality(sampleDoc, chunks);
    expect(report.passed).toBe(true);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
  });

  it('flags empty, duplicate, lost headings, broken sentences, missing metadata, and bad pages', async () => {
    const base = (
      await registry.getChunker('markdown').chunk(sampleDoc, { targetTokens: 120, overlapTokens: 0 })
    )[0]!;

    const defectiveChunks = [
      { ...base, id: 'c1', chunkIndex: 0, content: '   ', tokenCount: 0 }, // EMPTY_CHUNK
      { ...base, id: 'c2', chunkIndex: 1 },
      { ...base, id: 'c3', chunkIndex: 2 }, // DUPLICATE_CHUNK
      { ...base, id: 'c4', chunkIndex: 3, headingPath: [], contentHash: 'h4' }, // LOST_HEADING
      { ...base, id: 'c5', chunkIndex: 4, content: 'accrue paid leave without ending', contentHash: 'h5' }, // BROKEN_SENTENCE
      { ...base, id: 'c6', chunkIndex: 5, tenantId: '', contentHash: 'h6' }, // MISSING_METADATA
      { ...base, id: 'c7', chunkIndex: 6, pageNumber: 9, pageEndNumber: 9, contentHash: 'h7' }, // INVALID_PAGE_REFERENCE
    ];

    const report = validateChunkQuality(sampleDoc, defectiveChunks);
    const codes = new Set(report.issues.map((i) => i.code));

    expect(report.passed).toBe(false);
    expect(codes.has('EMPTY_CHUNK')).toBe(true);
    expect(codes.has('DUPLICATE_CHUNK')).toBe(true);
    expect(codes.has('LOST_HEADING')).toBe(true);
    expect(codes.has('BROKEN_SENTENCE')).toBe(true);
    expect(codes.has('MISSING_METADATA')).toBe(true);
    expect(codes.has('INVALID_PAGE_REFERENCE')).toBe(true);
  });
});