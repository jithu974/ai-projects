import type { IDocumentParser, SupportedMimeType } from '../../domain/document.js';
import { DocumentParsingError } from '../../shared/errors.js';
import { DocxParser } from './docx.parser.js';
import { HtmlParser } from './html.parser.js';
import { PdfParser } from './pdf.parser.js';
import { PptxParser } from './pptx.parser.js';
import { TextParser } from './text.parser.js';
import { XlsxParser } from './xlsx.parser.js';

export class ParserRegistry {
  private readonly parsers = new Map<SupportedMimeType, IDocumentParser>();

  constructor(initialParsers: readonly IDocumentParser[] = []) {
    for (const parser of initialParsers) {
      this.register(parser);
    }
  }

  register(parser: IDocumentParser): void {
    for (const mime of parser.supportedMimeTypes) {
      this.parsers.set(mime, parser);
    }
  }

  getParser(mimeType: SupportedMimeType): IDocumentParser {
    const parser = this.parsers.get(mimeType);
    if (!parser) {
      throw new DocumentParsingError(
        'UNSUPPORTED_FORMAT',
        `No parser registered for MIME type: ${mimeType}`,
      );
    }
    return parser;
  }

  static createDefault(): ParserRegistry {
    return new ParserRegistry([
      new PdfParser(),
      new DocxParser(),
      new PptxParser(),
      new XlsxParser(),
      new HtmlParser(),
      new TextParser(),
    ]);
  }
}