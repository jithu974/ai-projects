import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IObjectStorage } from '../../domain/storage.js';

export class LocalDiskObjectStorage implements IObjectStorage {
  private readonly rootDir: string;

  constructor(baseDir: string) {
    this.rootDir = path.resolve(baseDir);
  }

  private resolveSafePath(key: string): string {
    const normalizedKey = key.replace(/^\/+/, '');
    const targetPath = path.resolve(this.rootDir, normalizedKey);
    if (!targetPath.startsWith(this.rootDir + path.sep)) {
      throw new Error(`Invalid storage key outside root directory: ${key}`);
    }
    return targetPath;
  }

  async putObject(key: string, data: Buffer): Promise<void> {
    const fullPath = this.resolveSafePath(key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }

  async getObject(key: string): Promise<Buffer> {
    const fullPath = this.resolveSafePath(key);
    return readFile(fullPath);
  }

  async deleteObject(key: string): Promise<void> {
    const fullPath = this.resolveSafePath(key);
    await unlink(fullPath).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err;
    });
  }
}