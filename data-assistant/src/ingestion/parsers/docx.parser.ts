import * as cheerio from 'cheerio';
import mammoth from 'mammoth';
import type { IDocumentParser, ParsedDocument } from '../../domain/document.js';
import { DocumentParsingError } from '../../shared/errors.js';

export class DocxParser implements IDocumentParser {
  public readonly name = 'mammoth';
  public readonly version = '1.13.0';
  public readonly supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ] as const;

  async parse(buffer: Buffer): Promise<ParsedDocument> {
    try {
      const result = await mammoth.convertToHtml({ buffer });
      const $ = cheerio.load(result.value);

      // Convert HTML headings to Markdown headings so Phase 3 chunkers preserve hierarchy
      $('h1, h2, h3, h4, h5, h6').each((_i, el) => {
        const level = Number(el.tagName.slice(1));
        $(el).replaceWith(`\n${'#'.repeat(level)} ${$(el).text().trim()}\n`);
      });
      $('li').each((_i, el) => {
        $(el).replaceWith(`\n- ${$(el).text().trim()}`);
      });
      $('p, tr').each((_i, el) => {
        $(el).append('\n');
      });

      const text = $.root().text();
      return {
        parserName: this.name,
        parserVersion: this.version,
        pages: [{ pageNumber: 1, text }],
        metadata: { warningCount: result.messages.length },
      };
    } catch (err) {
      throw new DocumentParsingError(
        'CORRUPTED_FILE',
        `Failed to parse DOCX: ${err instanceof Error ? err.message : 'Unknown error'}`,
        false,
        err,
      );
    }
  }
}