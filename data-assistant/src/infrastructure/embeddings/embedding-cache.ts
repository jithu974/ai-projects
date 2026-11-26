import type { Redis } from 'ioredis';
import type { IEmbeddingCache } from '../../domain/embedding.js';

export function encodeFloat32Vector(vector: readonly number[]): Buffer {
  const f32 = Float32Array.from(vector);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

export function decodeFloat32Vector(buf: Buffer): number[] {
  if (buf.byteLength === 0 || buf.byteLength % 4 !== 0) {
    throw new Error(`Corrupt Float32 embedding buffer length: ${buf.byteLength}`);
  }
  const aligned = Uint8Array.from(buf);
  const f32 = new Float32Array(aligned.buffer);
  return Array.from(f32);
}

export class RedisEmbeddingCache implements IEmbeddingCache {
  constructor(private readonly redis: Redis) {}

  async getMany(keys: readonly string[]): Promise<(number[] | null)[]> {
    if (keys.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.getBuffer(key);
    }
    const results = await pipeline.exec();
    if (!results) return keys.map(() => null);

    return results.map(([err, raw]) => {
      if (err || !Buffer.isBuffer(raw)) return null;
      try {
        return decodeFloat32Vector(raw);
      } catch {
        return null;
      }
    });
  }

  async setMany(
    entries: readonly { key: string; vector: number[] }[],
    ttlSeconds: number,
  ): Promise<void> {
    if (entries.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const entry of entries) {
      pipeline.set(entry.key, encodeFloat32Vector(entry.vector), 'EX', ttlSeconds);
    }
    await pipeline.exec();
  }
}