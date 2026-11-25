// src/ingestion/parsers/text.parser.ts
import type { IDocumentParser, ParsedDocument } from '../../domain/document.js';

export class TextParser implements IDocumentParser {
  public readonly name = 'utf8-text';
  public readonly version = '1.0.0';
  public readonly supportedMimeTypes = ['text/plain', 'text/markdown'] as const;

  async parse(buffer: Buffer): Promise<ParsedDocument> {
    return {
      parserName: this.name,
      parserVersion: this.version,
      pages: [{ pageNumber: 1, text: buffer.toString('utf8') }],
      metadata: {},
    };
  }
}