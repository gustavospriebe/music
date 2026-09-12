import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { claimNextJob } from '@resenha/database';
import type { GeneratedLyrics, Story } from '@resenha/contracts';
import { splitStoryContact } from '@resenha/domain';
import type { LyricsProvider } from '@resenha/providers';
import { processLyricsJob, settleLyricsJob, type WorkerConfig } from './worker.js';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL_TEST ?? 'postgresql://resenha:resenha@localhost:5433/resenha_test',
});

const config: WorkerConfig = {
  databaseUrl:
    process.env.DATABASE_URL_TEST ?? 'postgresql://resenha:resenha@localhost:5433/resenha_test',
  workerId: 'lyrics-job-test',
  pollIntervalMs: 1_000,
  lockTimeoutMs: 300_000,
  concurrency: 1,
  storagePath: './var/lyrics-job-test-storage',
  storage: { kind: 'local', basePath: './var/lyrics-job-test-storage' },
  reviewMode: 'manual',
  webUrl: 'http://localhost:5175',
  tokenPepper: 'a-local-token-pepper-with-more-than-32-chars',
  musicProvider: 'openrouter',
  musicModel: 'test-music-model',
  openRouterApiKey: 'test-key',
  openRouterMusicModel: 'test-music-model',
  openRouterTextModel: 'test-text-model',
  openRouterTextMaxTokens: 8192,
  googleApiKey: '',
  googleMusicModel: 'lyria-3.5',
  email: { kind: 'local-log', from: 'test@example.test', basePath: './var/emails' },
};

const story: Story = {
  productType: 'custom_song',
  buyerName: 'Ana',
  buyerEmail: 'ana@example.test',
  subjectName: 'Bia',
  occasion: 'Aniversário de 40',
  genre: 'pagode',
  voice: 'female',
  mood: 'animado',
  facts: ['Bia faz a melhor feijoada da esquina', 'Bia dança na cozinha ouvindo radio antigo'],
  catchphrases: [],
  prohibitedTopics: [],
  termsAccepted: true,
  policyVersion: '2026-09-12',
  marketingAccepted: false,
  intention: 'amizade',
  brief: 'Uma canção de aniversário para a Bia, com feijoada e rádio antigo na cozinha.',
  safetyConfirmed: true,
};

const lyricsWith = (fullLyrics: string): GeneratedLyrics => ({
  title: 'A música da Bia',
  summary: 'resumo',
  language: 'pt-BR',
  musicalDirection: {
    genre: 'pagode',
    mood: 'animado',
    tempo: 'medium',
    voice: 'female',
    instrumentation: ['violão'],
  },
  pronunciationNotes: [],
  sections: [
    { type: 'verse', label: 'Verso', lyrics: 'verso' },
    { type: 'chorus', label: 'Refrão', lyrics: 'refrão' },
    { type: 'outro', label: 'Final', lyrics: 'fim' },
  ],
  fullLyrics,
  safetyNotes: [],
});

const usage = {
  requestId: 'lyrics-job-1',
  model: 'test-text-model',
  inputTokens: 11,
  outputTokens: 22,
  costUsd: '0.001000',
  costSource: 'reported' as const,
  latencyMs: 10,
};

const validProvider = (): LyricsProvider => ({
  generate: async (input) => ({
    lyrics: lyricsWith([input.subjectName, ...input.facts].join('\n')),
    usage,
  }),
});

const setup = async (options: {
  publicId: string;
  payload?: unknown;
  status?: string;
  withBase?: boolean;
}) => {
  const order = await pool.query<{ id: string }>(
    `insert into orders(public_id,product_type,status,price_cents,access_token_hash)
     values($1,'custom_song',$2,4990,'hash') returning id`,
    [options.publicId, options.status ?? 'lyrics_generating'],
  );
  const orderId = order.rows[0]?.id;
  if (!orderId) throw new Error('order insert failed');
  const { creative, contact } = splitStoryContact(story);
  await pool.query(`insert into story_sessions(order_id,data) values($1,$2)`, [
    orderId,
    JSON.stringify(creative),
  ]);
  await pool.query(
    `insert into order_contacts(order_id,email,name,marketing_accepted) values($1,$2,$3,$4)`,
    [orderId, contact.email, contact.name, contact.marketingAccepted],
  );
  if (options.withBase) {
    await pool.query(
      `insert into lyric_versions(order_id,number,kind,content) values($1,1,'generated',$2)`,
      [orderId, JSON.stringify(lyricsWith('Bia faz a melhor feijoada da esquina'))],
    );
  }
  const nextVersion = options.withBase ? 2 : 1;
  const payload = {
    targetVersion: nextVersion,
    ...((options.payload as Record<string, unknown>) ?? {}),
  };
  const job = await pool.query<{ id: string }>(
    `insert into generation_jobs(type,order_id,payload,idempotency_key,max_attempts)
     values('generate_lyrics',$1,$2,$3,6) returning id`,
    [orderId, JSON.stringify(payload), `lyrics:${orderId}:${nextVersion}`],
  );
  const jobId = job.rows[0]?.id;
  if (!jobId) throw new Error('job insert failed');
  const claimed = await claimNextJob(pool, config.workerId);
  if (!claimed || claimed.id !== jobId) throw new Error('Unexpected job claim');
  return { orderId, job: claimed };
};

beforeAll(async () => {
  const db = new URL(config.databaseUrl);
  if (
    !['localhost', '127.0.0.1'].includes(db.hostname) ||
    !/(?:_test|_remediation_[a-z_]+)$/.test(db.pathname)
  )
    throw new Error('Requires isolated remediation test DB');
  await pool.query('truncate table analytics_events, orders cascade');
});

afterAll(async () => {
  await pool.query("delete from orders where public_id like 'lyrics-job-%'");
  await pool.end();
});

describe('processLyricsJob', () => {
  it('writes a generated version, lyrics_ready, and usage with job_id', async () => {
    const { orderId, job } = await setup({ publicId: 'lyrics-job-ok' });
    await settleLyricsJob(pool, job, config, validProvider());
    expect(
      (await pool.query('select status from orders where id=$1', [orderId])).rows[0].status,
    ).toBe('lyrics_ready');
    expect(
      (
        await pool.query(
          'select number,kind from lyric_versions where order_id=$1 order by number',
          [orderId],
        )
      ).rows,
    ).toEqual([{ number: 1, kind: 'generated' }]);
    expect(
      (
        await pool.query('select job_id,kind,status,cost_usd from ai_usage where order_id=$1', [
          orderId,
        ])
      ).rows[0],
    ).toMatchObject({
      job_id: job.id,
      kind: 'lyrics',
      status: 'ok',
      cost_usd: '0.001000',
    });
  });

  it('marks first-generation validation exhaustion as failed after three attempts', async () => {
    let calls = 0;
    const generate = vi.fn(async () => {
      calls += 1;
      return {
        lyrics: lyricsWith('Uma letra bonita que ignora os fatos literais.'),
        usage: { ...usage, requestId: `lyrics-job-invalid-${calls}` },
      };
    });
    const { orderId, job } = await setup({ publicId: 'lyrics-job-invalid' });
    await settleLyricsJob(pool, job, config, { generate });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(
      (await pool.query('select status from orders where id=$1', [orderId])).rows[0].status,
    ).toBe('failed');
    expect(
      (await pool.query('select status from ai_usage where order_id=$1', [orderId])).rows,
    ).toEqual([{ status: 'rejected' }, { status: 'rejected' }, { status: 'rejected' }]);
  });

  it('marks a first-generation provider throw as failed', async () => {
    const { orderId, job } = await setup({ publicId: 'lyrics-job-throw' });
    await settleLyricsJob(pool, job, config, {
      generate: async () => {
        throw new Error('openrouter down');
      },
    });
    expect(
      (await pool.query('select status from orders where id=$1', [orderId])).rows[0].status,
    ).toBe('failed');
    expect(
      (await pool.query('select status,error from ai_usage where order_id=$1', [orderId])).rows[0],
    ).toMatchObject({ status: 'error', error: 'Falha interna da operação.' });
  });

  it('restores lyrics_ready when a refinement provider call fails', async () => {
    const { orderId, job } = await setup({
      publicId: 'lyrics-job-refine-fail',
      status: 'lyrics_generating',
      withBase: true,
      payload: { refinement: { instructions: 'Mais energia no refrão', baseVersion: 1 } },
    });
    await settleLyricsJob(pool, job, config, {
      generate: async () => {
        throw new Error('refinement provider failed');
      },
    });
    expect(
      (await pool.query('select status from orders where id=$1', [orderId])).rows[0].status,
    ).toBe('lyrics_ready');
    expect(
      (
        await pool.query('select count(*)::int as count from lyric_versions where order_id=$1', [
          orderId,
        ])
      ).rows[0].count,
    ).toBe(1);
  });

  it('rejects an invalid payload as terminal', async () => {
    const { job } = await setup({
      publicId: 'lyrics-job-bad-payload',
      payload: { unexpected: true },
    });
    await expect(processLyricsJob(pool, job, config, validProvider())).rejects.toMatchObject({
      terminal: true,
      code: 'JOB_PAYLOAD_INVALID',
    });
  });
});
