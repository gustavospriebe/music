import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type EmailConfig =
  | { kind: 'local-log'; from: string; basePath: string }
  | { kind: 'resend'; from: string; apiKey: string };
export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};
export type EmailProvider = {
  kind: EmailConfig['kind'];
  send: (message: EmailMessage, idempotencyKey: string) => Promise<{ externalId: string | null }>;
};

export const readEmailConfig = (env: NodeJS.ProcessEnv): EmailConfig => {
  const production = env.NODE_ENV === 'production';
  const selected = env.EMAIL_PROVIDER ?? 'resend';
  if (!['resend', 'local-log'].includes(selected))
    throw new Error('EMAIL_PROVIDER must be resend or local-log');
  const apiKey = env.RESEND_API_KEY?.trim();
  if (production && selected === 'local-log')
    throw new Error('EMAIL_PROVIDER=local-log is not allowed in production');
  if (production && !apiKey) throw new Error('RESEND_API_KEY is required');
  const from =
    env.EMAIL_FROM?.trim() || (production ? '' : 'Música da Resenha <onboarding@resend.dev>');
  if (
    !from ||
    /[\r\n]/.test(from) ||
    !/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(from.match(/<([^<>]+)>$/)?.[1] ?? from)
  )
    throw new Error('EMAIL_FROM must be a valid sender address');
  if (selected === 'resend' && apiKey) return { kind: 'resend', from, apiKey };
  return { kind: 'local-log', from, basePath: env.LOCAL_EMAIL_PATH ?? './var/emails' };
};

/** Transport owns network/files only; durable intent and retry belong to the worker. */
export const createEmailProvider = (config: EmailConfig): EmailProvider => ({
  kind: config.kind,
  send: async (message, idempotencyKey) => {
    if (config.kind === 'local-log') {
      await mkdir(config.basePath, { recursive: true, mode: 0o700 });
      const name = createHash('sha256').update(idempotencyKey).digest('hex');
      await writeFile(
        join(config.basePath, `${name}.txt`),
        `Para: ${message.to}\nDe: ${message.from}\nAssunto: ${message.subject}\n\n${message.text}\n`,
        { mode: 0o600 },
      );
      return { externalId: null };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({ ...message, to: [message.to] }),
      });
      // Provider bodies can contain private message data; never persist them in job errors.
      if (!response.ok) throw new Error(`Resend failed (${response.status})`);
      const body = (await response.json()) as { id?: unknown };
      if (typeof body.id !== 'string' || !body.id || body.id.length > 160)
        throw new Error('Resend returned an invalid email identifier');
      return { externalId: body.id };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Resend ')) throw error;
      throw new Error(
        controller.signal.aborted ? 'Resend request timed out' : 'Resend request failed',
      );
    } finally {
      clearTimeout(timeout);
    }
  },
});
