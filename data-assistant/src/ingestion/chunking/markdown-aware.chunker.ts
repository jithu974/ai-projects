import type {
  ChunkContentType,
  ChunkingOptions,
  DocumentChunk,
  IChunker,
  ITokenizer,
} from '../../domain/chunk.js';
import type { NormalizedDocument } from '../../domain/document.js';
import { createDocumentChunk } from './helpers.js';
import { RecursiveChunker } from './sentence-recursive.chunkers.js';

interface StructuralBlock {
  type: ChunkContentType;
  content: string;
  pageNumber: number;
  pageLabel?: string | undefined;
  headingPath: string[];
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const TABLE_ROW_RE = /^\|.*\|$/;

export class MarkdownAwareChunker implements IChunker {
  public readonly name = 'markdown' as const;
  private readonly recursive: RecursiveChunker;

  constructor(private readonly tokenizer: ITokenizer) {
    this.recursive = new RecursiveChunker(tokenizer);
  }

  private parseBlocks(doc: NormalizedDocument): StructuralBlock[] {
    const blocks: StructuralBlock[] = [];
    const headingStack: { level: number; text: string }[] = [];

    for (const page of doc.pages) {
      const lines = page.content.split('\n');
      let i = 0;

      const currentPath = () => headingStack.map((h) => h.text);

      while (i < lines.length) {
        const line = lines[i] ?? '';
        const trimmed = line.trim();

        if (!trimmed) {
          i++;
          continue;
        }

        // 1. Heading updates hierarchy stack (never emitted as an orphaned chunk alone)
        const headingMatch = HEADING_RE.exec(trimmed);
        if (headingMatch) {
          const level = headingMatch[1]!.length;
          const text = headingMatch[2]!.trim();
          while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
            headingStack.pop();
          }
          headingStack.push({ level, text });
          i++;
          continue;
        }

        // 2. Fenced code block kept atomic
        if (trimmed.startsWith('```')) {
          const codeLines = [line];
          i++;
          while (i < lines.length) {
            codeLines.push(lines[i]!);
            if ((lines[i] ?? '').trim().startsWith('```')) {
              i++;
              break;
            }
            i++;
          }
          blocks.push({
            type: 'code',
            content: codeLines.join('\n'),
            pageNumber: page.pageNumber,
            pageLabel: page.label,
            headingPath: currentPath(),
          });
          continue;
        }

        // 3. Markdown table block kept atomic
        if (TABLE_ROW_RE.test(trimmed)) {
          const tableLines: string[] = [];
          while (i < lines.length && TABLE_ROW_RE.test((lines[i] ?? '').trim())) {
            tableLines.push((lines[i] ?? '').trim());
            i++;
          }
          blocks.push({
            type: 'table',
            content: tableLines.join('\n'),
            pageNumber: page.pageNumber,
            pageLabel: page.label,
            headingPath: currentPath(),
          });
          continue;
        }

        // 4. Paragraph / bullet list block
        const textLines: string[] = [];
        while (i < lines.length) {
          const next = (lines[i] ?? '').trim();
          if (!next || HEADING_RE.test(next) || TABLE_ROW_RE.test(next) || next.startsWith('```')) {
            break;
          }
          textLines.push(lines[i]!);
          i++;
        }

        if (textLines.length > 0) {
          const isList = textLines.every((l) => /^[-*+]\s+|^\d+\.\s+/.test(l.trim()));
          blocks.push({
            type: isList ? 'list' : 'text',
            content: textLines.join('\n').trim(),
            pageNumber: page.pageNumber,
            pageLabel: page.label,
            headingPath: currentPath(),
          });
        }
      }
    }

    return blocks;
  }

  private splitLargeTableWithHeaders(tableMarkdown: string, maxTokens: number): string[] {
    if (this.tokenizer.countTokens(tableMarkdown) <= maxTokens) return [tableMarkdown];

    const rows = tableMarkdown.split('\n');
    if (rows.length <= 2) return [tableMarkdown];

    const headerBlock = `${rows[0]}\n${rows[1]}`;
    const bodyRows = rows.slice(2);
    const pieces: string[] = [];
    let current = headerBlock;

    for (const row of bodyRows) {
      const candidate = `${current}\n${row}`;
      if (this.tokenizer.countTokens(candidate) > maxTokens && current !== headerBlock) {
        pieces.push(current);
        current = `${headerBlock}\n${row}`;
      } else {
        current = candidate;
      }
    }
    if (current !== headerBlock) pieces.push(current);
    return pieces;
  }

  async chunk(doc: NormalizedDocument, options: ChunkingOptions): Promise<DocumentChunk[]> {
    const blocks = this.parseBlocks(doc);
    const chunks: DocumentChunk[] = [];

    let accText = '';
    let accHeadingKey = '';
    let accHeadingPath: string[] = [];
    let accPageStart = 1;
    let accPageEnd = 1;
    let accLabel: string | undefined;
    let accType: ChunkContentType = 'text';

    const flush = () => {
      if (!accText.trim()) return;
      chunks.push(
        createDocumentChunk({
          doc,
          tokenizer: this.tokenizer,
          strategyName: this.name,
          chunkIndex: chunks.length,
          pageNumber: accPageStart,
          pageEndNumber: accPageEnd,
          pageLabel: accLabel,
          headingPath: accHeadingPath,
          chunkType: accType,
          overlapTokens: options.overlapTokens,
          content: accText,
        }),
      );
      accText = '';
    };

    for (const block of blocks) {
      const headingKey = block.headingPath.join(' > ');

      // Flush on heading section change so unrelated sections never mix
      if (accText && headingKey !== accHeadingKey) {
        flush();
      }

      // Handle tables independently so headers are never severed
      if (block.type === 'table') {
        flush();
        const tablePieces = this.splitLargeTableWithHeaders(block.content, options.targetTokens);
        for (const piece of tablePieces) {
          chunks.push(
            createDocumentChunk({
              doc,
              tokenizer: this.tokenizer,
              strategyName: this.name,
              chunkIndex: chunks.length,
              pageNumber: block.pageNumber,
              pageEndNumber: block.pageNumber,
              pageLabel: block.pageLabel,
              headingPath: block.headingPath,
              chunkType: 'table',
              overlapTokens: 0,
              content: piece,
            }),
          );
        }
        continue;
      }

      // Split oversized prose blocks recursively within the same heading section
      if (this.tokenizer.countTokens(block.content) > options.targetTokens) {
        flush();
        const pieces = this.recursive.splitTextRecursively(
          block.content,
          options.targetTokens,
          options.overlapTokens,
        );
        for (const piece of pieces) {
          chunks.push(
            createDocumentChunk({
              doc,
              tokenizer: this.tokenizer,
              strategyName: this.name,
              chunkIndex: chunks.length,
              pageNumber: block.pageNumber,
              pageEndNumber: block.pageNumber,
              pageLabel: block.pageLabel,
              headingPath: block.headingPath,
              chunkType: block.type,
              overlapTokens: options.overlapTokens,
              content: piece,
            }),
          );
        }
        continue;
      }

      const candidate = accText ? `${accText}\n\n${block.content}` : block.content;
      if (accText && this.tokenizer.countTokens(candidate) > options.targetTokens) {
        flush();
      }

      if (!accText) {
        accText = block.content;
        accHeadingKey = headingKey;
        accHeadingPath = block.headingPath;
        accPageStart = block.pageNumber;
        accPageEnd = block.pageNumber;
        accLabel = block.pageLabel;
        accType = block.type;
      } else {
        accText = `${accText}\n\n${block.content}`;
        accPageEnd = block.pageNumber;
      }
    }

    flush();
    return chunks;
  }
}