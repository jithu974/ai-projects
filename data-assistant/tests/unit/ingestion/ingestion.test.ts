import { describe, expect, it } from 'vitest';
import { validateUploadedFile } from '../../../src/ingestion/file-validator.js';
import { cleanExtractedText } from '../../../src/ingestion/normalizer.js';
import { HtmlParser } from '../../../src/ingestion/parsers/html.parser.js';
import { TextParser } from '../../../src/ingestion/parsers/text.parser.js';

describe('File Validator', () => {
  it('accepts valid Markdown text and computes SHA-256', async () => {
    const res = await validateUploadedFile({
      buffer: Buffer.from('# Annual Leave Policy\nEmployees get 30 days.'),
      filename: 'leave-policy.md',
      maxBytes: 1024 * 1024,
    });
    expect(res.mimeType).toBe('text/markdown');
    expect(res.sha256Hash).toHaveLength(64);
    expect(res.sanitizedTitle).toBe('leave policy');
  });

  it('rejects a binary file disguised as .txt', async () => {
    // PNG magic header renamed to policy.txt
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(
      validateUploadedFile({ buffer: pngHeader, filename: 'policy.txt', maxBytes: 1024 * 1024 }),
    ).rejects.toThrow(/unsupported binary type/i);
  });

  it('accepts UTF-8 text with non-ASCII characters', async () => {
    const result = await validateUploadedFile({
      buffer: Buffer.from('Résumé — déjà vu'),
      filename: 'notes.txt',
      maxBytes: 1024 * 1024,
    });

    expect(result.mimeType).toBe('text/plain');
  });

  it('rejects files exceeding maxBytes with 413 error', async () => {
    await expect(
      validateUploadedFile({
        buffer: Buffer.alloc(2048, 'a'),
        filename: 'big.txt',
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
  });
});

describe('Text Cleaner & Parsers', () => {
  it('strips null bytes, repairs PDF hyphenation, and collapses excess blank lines', () => {
    const dirty = 'Employ-\nees\u0000 receive\r\n\r\n\r\n30   days.';
    expect(cleanExtractedText(dirty)).toBe('Employees receive\n\n30 days.');
  });

  it('strips script/style tags and preserves headings in HTML', async () => {
    const parser = new HtmlParser();
    const html = '<html><body><script>alert(1)</script><h1>HR Policy</h1><p>30 days leave.</p></body></html>';
    const parsed = await parser.parse(Buffer.from(html));
    const cleaned = cleanExtractedText(parsed.pages[0]?.text ?? '');
    expect(cleaned).toContain('# HR Policy');
    expect(cleaned).toContain('30 days leave.');
    expect(cleaned).not.toContain('alert(1)');
  });

  it('parses UTF-8 Markdown preserving structure', async () => {
    const parser = new TextParser();
    const parsed = await parser.parse(Buffer.from('# Title\nBody'));
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.pages[0]?.text).toContain('# Title');
  });
});