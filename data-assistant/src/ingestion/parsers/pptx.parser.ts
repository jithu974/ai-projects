import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import type { IDocumentParser, ParsedDocument, ParsedPage } from '../../domain/document.js';
import { DocumentParsingError } from '../../shared/errors.js';

function collectTextNodes(node: unknown, out: string[]): void {
  if (node === null || node === undefined) return;
  if (typeof node === 'string' || typeof node === 'number') {
    const str = String(node).trim();
    if (str) out.push(str);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectTextNodes(item, out);
    return;
  }
  if (typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'a:t') {
        collectTextNodes(value, out);
      } else {
        collectTextNodes(value, out);
      }
    }
  }
}

export class PptxParser implements IDocumentParser {
  public readonly name = 'ooxml-pptx';
  public readonly version = '1.0.0';
  public readonly supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ] as const;

  private readonly xmlParser = new XMLParser({
    ignoreAttributes: true,
    trimValues: true,
  });

  async parse(buffer: Buffer): Promise<ParsedDocument> {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const slidePaths = Object.keys(zip.files)
        .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
        .sort((a, b) => {
          const numA = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
          const numB = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
          return numA - numB;
        });

      const pages: ParsedPage[] = [];
      for (let i = 0; i < slidePaths.length; i++) {
        const slidePath = slidePaths[i];
        if (!slidePath) continue;
        const xml = await zip.file(slidePath)?.async('string');
        if (!xml) continue;

        const parsed = this.xmlParser.parse(xml) as Record<string, unknown>;
        const texts: string[] = [];
        // Extract only DrawingML text runs (`a:t`) inside slide shape tree
        const extractRuns = (obj: unknown): void => {
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) {
            obj.forEach(extractRuns);
            return;
          }
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            if (k === 'a:t') collectTextNodes(v, texts);
            else extractRuns(v);
          }
        };
        extractRuns(parsed);

        pages.push({
          pageNumber: i + 1,
          label: `Slide ${i + 1}`,
          text: texts.join('\n'),
        });
      }

      if (pages.length === 0) {
        throw new DocumentParsingError('EMPTY_CONTENT', 'Presentation contains no slides');
      }

      return {
        parserName: this.name,
        parserVersion: this.version,
        pages,
        metadata: { slideCount: pages.length },
      };
    } catch (err) {
      if (err instanceof DocumentParsingError) throw err;
      throw new DocumentParsingError(
        'CORRUPTED_FILE',
        `Failed to parse PPTX: ${err instanceof Error ? err.message : 'Unknown error'}`,
        false,
        err,
      );
    }
  }
}