import { extractText, getDocumentProxy, inspectPages } from 'unpdf';
import type { IDocumentParser, ParsedDocument, ParsedPage } from '../../domain/document.js';
import { DocumentParsingError } from '../../shared/errors.js';

export class PdfParser implements IDocumentParser {
  public readonly name = 'unpdf';
  public readonly version = '2.2.1';
  public readonly supportedMimeTypes = ['application/pdf'] as const;

  async parse(buffer: Buffer): Promise<ParsedDocument> {
    let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
    try {
      pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { totalPages, text } = await extractText(pdf, { mergePages: false });
      const pageTexts = Array.isArray(text) ? text : [text];

      const totalExtractedChars = pageTexts.reduce((sum, p) => sum + p.trim().length, 0);
      if (totalExtractedChars < 20) {
        const inspection = await inspectPages(pdf);
        const hasHeavyImages = inspection.pages.some((p) => p.imageCoverage > 0.4);
        if (hasHeavyImages) {
          throw new DocumentParsingError(
            'SCANNED_PDF_REQUIRES_OCR',
            'PDF appears to be image-based/scanned with no embedded text layer. OCR is required.',
          );
        }
        throw new DocumentParsingError('EMPTY_CONTENT', 'PDF contains no extractable text');
      }

      const pages: ParsedPage[] = pageTexts.map((pageText, idx) => ({
        pageNumber: idx + 1,
        text: pageText,
      }));

      return {
        parserName: this.name,
        parserVersion: this.version,
        pages,
        metadata: { totalPages },
      };
    } catch (err) {
      if (err instanceof DocumentParsingError) throw err;
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'PasswordException') {
        throw new DocumentParsingError(
          'ENCRYPTED_DOCUMENT',
          'Password-protected PDFs are not supported',
          false,
          err,
        );
      }
      throw new DocumentParsingError(
        'CORRUPTED_FILE',
        `Failed to parse PDF: ${err instanceof Error ? err.message : 'Unknown error'}`,
        false,
        err,
      );
    } finally {
      if (pdf) {
        await pdf.cleanup().catch(() => {});
      }
    }
  }
}