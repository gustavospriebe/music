import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLocalStorage, verifyMercadoPagoSignature } from './providers.js';

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

describe('Mercado Pago webhook signature', () => {
  const secret = 'webhook-secret';
  const sign = (dataId: string, requestId: string, ts: string) =>
    createHmac('sha256', secret)
      .update(`id:${dataId.toLowerCase()};request-id:${requestId.toLowerCase()};ts:${ts};`)
      .digest('hex');

  it('accepts a valid signature', () => {
    expect(
      verifyMercadoPagoSignature({
        signatureHeader: `ts=1704908010,v1=${sign('999', 'req-1', '1704908010')}`,
        requestId: 'req-1',
        dataId: '999',
        secret,
      }),
    ).toBe(true);
  });

  it('rejects tampered ids, missing headers and wrong secrets', () => {
    const valid = `ts=1704908010,v1=${sign('999', 'req-1', '1704908010')}`;
    expect(
      verifyMercadoPagoSignature({
        signatureHeader: valid,
        requestId: 'req-1',
        dataId: '111',
        secret,
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({
        signatureHeader: undefined,
        requestId: 'req-1',
        dataId: '999',
        secret,
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({
        signatureHeader: valid,
        requestId: 'req-1',
        dataId: '999',
        secret: 'other-secret',
      }),
    ).toBe(false);
  });
});
