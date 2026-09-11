import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalStorage, readStorageConfig } from './storage.js';

describe('private asset storage', () => {
  let localRoot: string | undefined;

  afterEach(async () => {
    if (localRoot) await rm(localRoot, { recursive: true, force: true });
    localRoot = undefined;
  });

  it('keeps local assets below the configured root', async () => {
    localRoot = await mkdtemp(join(tmpdir(), 'resenha-provider-'));
    const storage = createLocalStorage(localRoot);
    await expect(storage.put('../escape', Buffer.from('x'), 'text/plain')).rejects.toThrow(
      'Invalid storage key',
    );
    await storage.put('orders/public/audio.mp3', Buffer.from('private'), 'audio/mpeg');
    await expect(storage.get('orders/public/audio.mp3')).resolves.toEqual(Buffer.from('private'));
    await storage.delete('orders/public/audio.mp3');
    await expect(storage.get('orders/public/audio.mp3')).rejects.toThrow();
  });

  it('resolves local storage everywhere and requires an absolute path in production', () => {
    expect(
      readStorageConfig({ NODE_ENV: 'development', LOCAL_STORAGE_PATH: '/tmp/assets' }),
    ).toEqual({ kind: 'local', basePath: '/tmp/assets' });
    expect(() => readStorageConfig({ NODE_ENV: 'production' })).toThrow(
      'LOCAL_STORAGE_PATH must be absolute in production',
    );
    expect(() => readStorageConfig({ NODE_ENV: 'production', STORAGE_PROVIDER: 's3' })).toThrow(
      'STORAGE_PROVIDER must be local',
    );
    expect(
      readStorageConfig({
        NODE_ENV: 'production',
        LOCAL_STORAGE_PATH: '/data/resenha-storage',
      }),
    ).toEqual({ kind: 'local', basePath: '/data/resenha-storage' });
  });
});
