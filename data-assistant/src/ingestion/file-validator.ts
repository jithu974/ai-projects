import { isUtf8 } from 'node:buffer';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { SUPPORTED_MIME_TYPES, type SupportedMimeType } from '../domain/document.js';
import { PayloadTooLargeError, UnsupportedMediaTypeError, ValidationError } from '../shared/errors.js';

export interface ValidatedUpload {
  buffer: Buffer;
  originalFilename: string;
  sanitizedTitle: string;
  mimeType: SupportedMimeType;
  fileSizeBytes: number;
  sha256Hash: string;
}

const TEXT_EXT_TO_MIME: Record<string, SupportedMimeType> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.html': 'text/html',
  '.htm': 'text/html',
};

const SUPPORTED_SET = new Set<string>(SUPPORTED_MIME_TYPES);

function looksLikeBinary(buffer: Buffer): boolean {
  if (!isUtf8(buffer)) return true;
  for (const byte of buffer) {
    if (byte === 0x00 || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)) {
      return true;
    }
  }
  return false;
}

export async function validateUploadedFile(params: {
  buffer: Buffer;
  filename: string;
  maxBytes: number;
}): Promise<ValidatedUpload> {
  const { buffer, filename, maxBytes } = params;

  if (buffer.length === 0) {
    throw new ValidationError('Uploaded file is empty');
  }
  if (buffer.length > maxBytes) {
    throw new PayloadTooLargeError(
      `File exceeds maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))} MB`,
    );
  }

  const safeFilename = path.basename(filename).trim();
  if (!safeFilename) {
    throw new ValidationError('Filename is required');
  }

  const detected = await fileTypeFromBuffer(buffer);
  let resolvedMime: SupportedMimeType | undefined;

  if (detected) {
    if (SUPPORTED_SET.has(detected.mime)) {
      resolvedMime = detected.mime as SupportedMimeType;
    } else {
      throw new UnsupportedMediaTypeError(`Detected unsupported binary type: ${detected.mime}`, {
        detectedMime: detected.mime,
      });
    }
  } else {
    // Plain text formats lack binary magic headers
    if (looksLikeBinary(buffer)) {
      throw new UnsupportedMediaTypeError('Unsupported binary type: unrecognized file format');
    }
    const ext = path.extname(safeFilename).toLowerCase();
    resolvedMime = TEXT_EXT_TO_MIME[ext];
    if (!resolvedMime) {
      throw new UnsupportedMediaTypeError(
        `Unsupported text file extension "${ext || '(none)'}". Allowed: .pdf, .docx, .pptx, .xlsx, .txt, .md, .html`,
      );
    }
  }

  const sha256Hash = createHash('sha256').update(buffer).digest('hex');
  const sanitizedTitle = path.parse(safeFilename).name.replace(/[_-]+/g, ' ').trim() || safeFilename;

  return {
    buffer,
    originalFilename: safeFilename,
    sanitizedTitle,
    mimeType: resolvedMime,
    fileSizeBytes: buffer.length,
    sha256Hash,
  };
}