import {
  countTokens as bpeCountTokens,
  decode as bpeDecode,
  encode as bpeEncode,
  setMergeCacheSize,
} from 'gpt-tokenizer/encoding/cl100k_base';
import type { ITokenizer } from '../../domain/chunk.js';

export class Cl100kTokenizer implements ITokenizer {
  public readonly encodingName = 'cl100k_base';

  constructor(mergeCacheSize = 5000) {
    // Bound FIFO cache to protect 8 GB local dev machines from memory creep
    setMergeCacheSize(mergeCacheSize);
  }

  countTokens(text: string): number {
    if (!text) return 0;
    return bpeCountTokens(text);
  }

  encode(text: string): number[] {
    if (!text) return [];
    return bpeEncode(text);
  }

  decode(tokens: readonly number[]): string {
    if (tokens.length === 0) return '';
    return bpeDecode(tokens);
  }
}