export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'text/html',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export interface ParsedPage {
  pageNumber: number; // 1-based page, slide, or worksheet index
  label?: string;     // e.g., Excel worksheet name or slide title
  text: string;
}

export interface ParsedDocument {
  parserName: string;
  parserVersion: string;
  pages: ParsedPage[];
  metadata: Record<string, string | number | boolean>;
}

export interface NormalizedPage {
  pageNumber: number;
  label?: string;
  content: string;
  charCount: number;
}

export interface NormalizedDocument {
  documentId: string;
  versionId: string;
  tenantId: string;
  title: string;
  mimeType: SupportedMimeType;
  sha256Hash: string;
  parserName: string;
  parserVersion: string;
  pageCount: number;
  totalCharCount: number;
  pages: NormalizedPage[];
  metadata: Record<string, string | number | boolean>;
  normalizedAt: string;
}

export interface IDocumentParser {
  readonly name: string;
  readonly version: string;
  readonly supportedMimeTypes: readonly SupportedMimeType[];
  parse(buffer: Buffer, filename: string): Promise<ParsedDocument>;
}