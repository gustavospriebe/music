import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalStorage, createS3Storage, readStorageConfig } from './storage.js';

describe('private asset storage', () => {
  let localRoot: string | undefined;

  afterEach(async () => {
    if (localRoot) await rm(localRoot, { recursive: true, force: true });
    localRoot = undefined;
  });

  it('keeps local development assets below the configured root', async () => {
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

  it('uses private S3 object commands without public ACLs', async () => {
    const send = vi.fn(async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === 'GetObjectCommand')
        return { Body: { transformToByteArray: async () => Uint8Array.from([1, 2, 3]) } };
      return {};
    });
    const storage = createS3Storage(
      { kind: 's3', bucket: 'private-bucket', region: 'us-east-1', forcePathStyle: false },
      { send },
    );

    await storage.put('orders/public/cover.png', Buffer.from([1, 2, 3]), 'image/png');
    await expect(storage.get('orders/public/cover.png')).resolves.toEqual(Buffer.from([1, 2, 3]));
    await storage.delete('orders/public/cover.png');
    expect(send).toHaveBeenCalledTimes(3);
    const put = send.mock.calls[0]?.[0] as unknown as {
      input: Record<string, unknown>;
      constructor: { name: string };
    };
    expect(put.constructor.name).toBe('PutObjectCommand');
    expect(put.input).toMatchObject({
      Bucket: 'private-bucket',
      Key: 'orders/public/cover.png',
      ContentType: 'image/png',
    });
    expect(put.input).not.toHaveProperty('ACL');
  });

  it('streams the requested local byte interval and rejects traversal and malformed ranges', async () => {
    localRoot = await mkdtemp(join(tmpdir(), 'resenha-provider-range-'));
    const storage = createLocalStorage(localRoot);
    await storage.put('private/song.wav', Buffer.from('private-audio'), 'audio/wav');
    expect(await buffer(await storage.open('private/song.wav', { start: 2, end: 6 }))).toEqual(
      Buffer.from('ivate'),
    );
    expect(await buffer(await storage.open('private/song.wav'))).toEqual(
      Buffer.from('private-audio'),
    );
    await expect(storage.open('../escape')).rejects.toThrow('Invalid storage key');
    await expect(storage.open('private/song.wav', { start: 6, end: 2 })).rejects.toThrow(
      'Invalid storage range',
    );
  });

  it('forwards a private S3 Range and returns its stream without buffering the complete object', async () => {
    const body = Readable.from([Buffer.from('audio-interval')]);
    const send = vi.fn(async (command: unknown) => {
      void command;
      return { Body: body };
    });
    const storage = createS3Storage(
      { kind: 's3', bucket: 'private-bucket', region: 'us-east-1', forcePathStyle: false },
      { send },
    );
    const stream = await storage.open('private/song.wav', { start: 10, end: 23 });
    expect(stream).toBe(body);
    expect(await buffer(stream)).toEqual(Buffer.from('audio-interval'));
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: { Bucket: 'private-bucket', Key: 'private/song.wav', Range: 'bytes=10-23' },
    });
    await expect(storage.open('private/song.wav', { start: -1, end: 23 })).rejects.toThrow(
      'Invalid storage range',
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('permits local storage only outside production and validates S3 settings', () => {
    expect(
      readStorageConfig({ NODE_ENV: 'development', LOCAL_STORAGE_PATH: '/tmp/assets' }),
    ).toEqual({ kind: 'local', basePath: '/tmp/assets' });
    expect(() => readStorageConfig({ NODE_ENV: 'production' })).toThrow(
      'STORAGE_PROVIDER=s3 is required in production',
    );
    expect(() => readStorageConfig({ NODE_ENV: 'production', STORAGE_PROVIDER: 's3' })).toThrow(
      'STORAGE_S3_BUCKET is required',
    );
    expect(
      readStorageConfig({
        NODE_ENV: 'production',
        STORAGE_PROVIDER: 's3',
        STORAGE_S3_BUCKET: 'private-bucket',
        STORAGE_S3_REGION: 'us-east-1',
      }),
    ).toEqual({
      kind: 's3',
      bucket: 'private-bucket',
      region: 'us-east-1',
      forcePathStyle: false,
    });
  });
});
