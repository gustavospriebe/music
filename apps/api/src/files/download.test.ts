import Fastify from 'fastify';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { StorageProvider } from '@resenha/providers';
import { parseByteRange, sendPrivateFile } from './download.js';

describe('private streaming downloads', () => {
  it('normalizes bounded, suffix and open ranges; refuses malformed and multiple ranges', () => {
    expect(parseByteRange('bytes=3-99', 10)).toEqual({ start: 3, end: 9 });
    expect(parseByteRange('bytes=3-', 10)).toEqual({ start: 3, end: 9 });
    expect(parseByteRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
    for (const range of [
      'bytes=10-',
      'bytes=-0',
      'bytes=8-3',
      'bytes=0-1,3-4',
      'bytes=-',
      'items=0-1',
    ]) {
      expect(parseByteRange(range, 10)).toBeNull();
    }
  });
  it('streams only the authorized requested bytes and never loads the full object', async () => {
    const bytes = Buffer.from('0123456789');
    const storage: StorageProvider = {
      put: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(() => {
        throw new Error('buffered read forbidden');
      }),
      open: vi.fn(async (_key, range) =>
        Readable.from(range ? bytes.subarray(range.start, range.end + 1) : bytes),
      ),
    };
    const app = Fastify();
    app.get('/file', async (request, reply) => {
      if (request.headers.authorization !== 'allowed') return reply.code(401).send();
      return sendPrivateFile(request, reply, storage, {
        storageKey: 'private',
        mimeType: 'audio/wav',
        sizeBytes: 10,
      });
    });
    try {
      expect((await app.inject('/file')).statusCode).toBe(401);
      expect(storage.open).not.toHaveBeenCalled();
      const partial = await app.inject({
        url: '/file',
        headers: { authorization: 'allowed', range: 'bytes=2-4' },
      });
      expect(partial.statusCode).toBe(206);
      expect(partial.body).toBe('234');
      expect(partial.headers['content-range']).toBe('bytes 2-4/10');
      expect(partial.headers['content-length']).toBe('3');
      const invalid = await app.inject({
        url: '/file',
        headers: { authorization: 'allowed', range: 'bytes=11-' },
      });
      expect(invalid.statusCode).toBe(416);
      expect(storage.open).toHaveBeenCalledTimes(1);
      expect(storage.get).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
