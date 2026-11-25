import type {
  NormalizedDocument,
  NormalizedPage,
  ParsedDocument,
  SupportedMimeType,
} from '../domain/document.js';
import { DocumentParsingError } from '../shared/errors.js';

export function cleanExtractedText(raw: string): string {
  return (
    raw
      // Normalize Unicode compatibility forms (smart quotes, ligatures like ﬁ -> fi)
      .normalize('NFKC')
      // Strip UTF-8 BOM and dangerous control chars (including \u0000 which breaks Postgres)
      .replace(/^\uFEFF/, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      // Standardize line endings
      .replace(/\r\n?/g, '\n')
      // Repair common PDF line-wrap hyphenation: "employ-\nees" -> "employees"
      .replace(/([a-zA-Z])-\n([a-z])/g, '$1$2')
      // Collapse horizontal runs of spaces/tabs without flattening Markdown indentation
      .replace(/[ \t]{2,}/g, ' ')
      // Trim trailing whitespace per line
      .replace(/[ \t]+\n/g, '\n')
      // Collapse 3+ consecutive newlines to a single paragraph break
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export function normalizeParsedDocument(params: {
  documentId: string;
  versionId: string;
  tenantId: string;
  title: string;
  mimeType: SupportedMimeType;
  sha256Hash: string;
  parsed: ParsedDocument;
}): NormalizedDocument {
  const pages: NormalizedPage[] = [];

  for (const page of params.parsed.pages) {
    const content = cleanExtractedText(page.text);
    if (!content) continue;
    pages.push({
      pageNumber: page.pageNumber,
      ...(page.label !== undefined ? { label: page.label } : {}),
      content,
      charCount: content.length,
    });
  }

  const totalCharCount = pages.reduce((sum, p) => sum + p.charCount, 0);
  if (totalCharCount === 0) {
    throw new DocumentParsingError('EMPTY_CONTENT', 'Document contains no usable text after cleaning');
  }

  return {
    documentId: params.documentId,
    versionId: params.versionId,
    tenantId: params.tenantId,
    title: params.title,
    mimeType: params.mimeType,
    sha256Hash: params.sha256Hash,
    parserName: params.parsed.parserName,
    parserVersion: params.parsed.parserVersion,
    pageCount: pages.length,
    totalCharCount,
    pages,
    metadata: params.parsed.metadata,
    normalizedAt: new Date().toISOString(),
  };
}