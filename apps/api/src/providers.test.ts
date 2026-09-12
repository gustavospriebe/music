import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLocalStorage, verifyAbacatePaySecret } from '@resenha/providers';

describe('storage provider', () => {
  it('stores files below its configured root and rejects traversal-like keys', async () => {
    const root = await mkdtemp(join(tmpdir(), 'resenha-storage-'));
    const storage = createLocalStorage(root);
    try {
      await expect(
        storage.put('../outside.txt', Buffer.from('safe'), 'text/plain'),
      ).rejects.toThrow('Invalid storage key');
      const saved = await storage.put('orders/demo/audio.wav', Buffer.from('demo'), 'audio/wav');
      expect(saved).toMatchObject({ key: 'orders/demo/audio.wav', size: 4, mime: 'audio/wav' });
      await expect(storage.get(saved.key)).resolves.toEqual(Buffer.from('demo'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('AbacatePay webhook secret', () => {
  it('accepts a matching secret and rejects missing or different values', () => {
    expect(verifyAbacatePaySecret({ received: 'abc', expected: 'abc' })).toBe(true);
    expect(verifyAbacatePaySecret({ received: 'abc', expected: 'abd' })).toBe(false);
    expect(verifyAbacatePaySecret({ received: undefined, expected: 'abc' })).toBe(false);
    expect(verifyAbacatePaySecret({ received: 'abc', expected: undefined })).toBe(false);
    expect(verifyAbacatePaySecret({ received: 'ab', expected: 'abc' })).toBe(false);
  });
});
