// src/ingestion/parsers/html.parser.ts
import * as cheerio from 'cheerio';
import type { IDocumentParser, ParsedDocument } from '../../domain/document.js';

export class HtmlParser implements IDocumentParser {
  public readonly name = 'cheerio-html';
  public readonly version = '1.2.0';
  public readonly supportedMimeTypes = ['text/html'] as const;

  async parse(buffer: Buffer): Promise<ParsedDocument> {
    const $ = cheerio.load(buffer.toString('utf8'));
    // Strip non-content elements (critical in Cheerio 1.x)
    $('script, style, noscript, nav, footer, svg, iframe').remove();

    const pageTitle = $('title').first().text().trim();
    $('h1, h2, h3, h4, h5, h6').each((_i, el) => {
      const level = Number(el.tagName.slice(1));
      $(el).replaceWith(`\n${'#'.repeat(level)} ${$(el).text().trim()}\n`);
    });
    $('p, li, tr, br').each((_i, el) => {
      $(el).append('\n');
    });

    const text = $('body').length > 0 ? $('body').text() : $.root().text();
    return {
      parserName: this.name,
      parserVersion: this.version,
      pages: [{ pageNumber: 1, text }],
      metadata: pageTitle ? { htmlTitle: pageTitle } : {},
    };
  }
}