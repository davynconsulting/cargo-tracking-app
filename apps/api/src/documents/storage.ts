import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Private file store. Development writes to disk; production swaps in S3 with the same interface. */
export interface FileStore {
  put(content: Buffer): Promise<{ key: string; sha256: string }>;
  get(key: string): Promise<Buffer>;
}

export class DiskFileStore implements FileStore {
  constructor(private readonly root: string) {}

  async put(content: Buffer) {
    const key = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}`;
    const target = path.join(this.root, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
    return { key, sha256: createHash('sha256').update(content).digest('hex') };
  }

  async get(key: string) {
    if (key.includes('..')) throw new Error('Invalid storage key');
    return readFile(path.join(this.root, key));
  }
}

export const FILE_STORE = Symbol('FILE_STORE');

const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

/** The file's own bytes decide its type; the name and the browser's claim are not trusted. */
export function detectMime(content: Buffer): string | null {
  return SIGNATURES.find((s) => s.test(content))?.mime ?? null;
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
