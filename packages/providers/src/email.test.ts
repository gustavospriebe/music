import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmailProvider, readEmailConfig } from './email.js';

const message = {
  from: 'Music <music@example.test>',
  to: 'buyer@example.test',
  subject: 'Pronta',
  text: 'Link privado: http://local/entrega/private',
  html: '<p>Pronta</p>',
};
afterEach(() => vi.unstubAllGlobals());
describe('email configuration', () => {
  it('selects only supported providers and uses local fallback outside production', () => {
    expect(readEmailConfig({})).toMatchObject({ kind: 'local-log', basePath: './var/emails' });
    expect(
      readEmailConfig({
        EMAIL_PROVIDER: 'local-log',
        RESEND_API_KEY: 'unused',
        LOCAL_EMAIL_PATH: '/tmp/mail',
      }),
    ).toMatchObject({ kind: 'local-log', basePath: '/tmp/mail' });
    expect(
      readEmailConfig({
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 'key',
        EMAIL_FROM: message.from,
      }),
    ).toEqual({ kind: 'resend', apiKey: 'key', from: message.from });
    expect(() => readEmailConfig({ EMAIL_PROVIDER: 'other' })).toThrow(
      'EMAIL_PROVIDER must be resend or local-log',
    );
  });
  it('fails closed in production without a supported transport, credentials and sender', () => {
    expect(() => readEmailConfig({ NODE_ENV: 'production', EMAIL_PROVIDER: 'local-log' })).toThrow(
      'not allowed in production',
    );
    expect(() => readEmailConfig({ NODE_ENV: 'production' })).toThrow('RESEND_API_KEY is required');
    expect(() => readEmailConfig({ NODE_ENV: 'production', RESEND_API_KEY: 'key' })).toThrow(
      'EMAIL_FROM',
    );
    expect(() => readEmailConfig({ EMAIL_FROM: 'bad\naddress' })).toThrow('EMAIL_FROM');
  });
});
describe('email transport', () => {
  it('writes a private local email and retry overwrites the same receipt', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'email-provider-'));
    try {
      const provider = createEmailProvider({ kind: 'local-log', basePath, from: message.from });
      await provider.send(message, 'stable-intent');
      await provider.send(message, 'stable-intent');
      const files = await readdir(basePath);
      expect(files).toHaveLength(1);
      const path = join(basePath, files[0]!);
      expect(await readFile(path, 'utf8')).toContain(message.text);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });
  it('sends the complete immutable payload with the idempotency header', async () => {
    const fetch = vi.fn(async () => Response.json({ id: 'mail-id' }));
    vi.stubGlobal('fetch', fetch);
    const result = await createEmailProvider({
      kind: 'resend',
      apiKey: 'key',
      from: message.from,
    }).send(message, 'intent-1');
    expect(result).toEqual({ externalId: 'mail-id' });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        headers: {
          authorization: 'Bearer key',
          'content-type': 'application/json',
          'idempotency-key': 'intent-1',
        },
        body: JSON.stringify({ ...message, to: [message.to] }),
      }),
    );
  });
  it('does not expose provider payloads and rejects missing acknowledgement', async () => {
    const provider = createEmailProvider({ kind: 'resend', apiKey: 'key', from: message.from });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('buyer@example.test private-token', { status: 422 })),
    );
    await expect(provider.send(message, 'intent')).rejects.toThrow(/^Resend failed \(422\)$/);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({})),
    );
    await expect(provider.send(message, 'intent')).rejects.toThrow('invalid email identifier');
  });
  it('aborts stalled transport and reports a safe timeout', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener('abort', () =>
                reject(new Error('private transport details')),
              );
            }),
        ),
      );
      const sending = createEmailProvider({
        kind: 'resend',
        apiKey: 'key',
        from: message.from,
      }).send(message, 'intent');
      const assertion = expect(sending).rejects.toThrow('Resend request timed out');
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
