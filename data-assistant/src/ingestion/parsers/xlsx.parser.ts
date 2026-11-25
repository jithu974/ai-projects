import readXlsxFile from 'read-excel-file/node';
import type { IDocumentParser, ParsedDocument, ParsedPage } from '../../domain/document.js';
import { DocumentParsingError } from '../../shared/errors.js';

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString().split('T')[0] ?? '';
  return String(cell).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

export class XlsxParser implements IDocumentParser {
  public readonly name = 'read-excel-file';
  public readonly version = '9.3.14';
  public readonly supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ] as const;

  async parse(buffer: Buffer): Promise<ParsedDocument> {
    try {
      const sheets = await readXlsxFile(buffer);
      const pages: ParsedPage[] = [];

      for (const [i, sheet] of sheets.entries()) {
        const nonEmptyRows = sheet.data
          .map((row) => row.map(cellToString))
          .filter((row) => row.some((cell) => cell.length > 0));

        if (nonEmptyRows.length === 0) continue;

        const header = nonEmptyRows[0] ?? [];
        const separator = header.map(() => '---');
        const body = nonEmptyRows.slice(1);

        const markdownLines = [
          `## Sheet: ${sheet.sheet}`,
          '',
          `| ${header.join(' | ')} |`,
          `| ${separator.join(' | ')} |`,
          ...body.map((r) => `| ${header.map((_h, idx) => r[idx] ?? '').join(' | ')} |`),
        ];

        pages.push({
          pageNumber: i + 1,
          label: sheet.sheet,
          text: markdownLines.join('\n'),
        });
      }

      if (pages.length === 0) {
        throw new DocumentParsingError('EMPTY_CONTENT', 'Workbook contains no non-empty rows');
      }

      return {
        parserName: this.name,
        parserVersion: this.version,
        pages,
        metadata: { sheetCount: pages.length },
      };
    } catch (err) {
      if (err instanceof DocumentParsingError) throw err;
      throw new DocumentParsingError(
        'CORRUPTED_FILE',
        `Failed to parse XLSX: ${err instanceof Error ? err.message : 'Unknown error'}`,
        false,
        err,
      );
    }
  }
}