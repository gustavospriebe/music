import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateGoogleMusicOnce,
  generateMusicOnce,
  type MusicProviderName,
} from '../apps/worker/src/worker.js';

const GOOGLE_MODEL = 'lyria-3.5';
const OPENROUTER_MODEL = 'google/lyria-3-pro-preview';
const PRICE_PER_CALL_USD = 0.08;
const AUTHORIZED_BUDGET_CEILING_USD = 3;
const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const prompts = [
  {
    id: 'fictional-bakery',
    text: 'Crie uma canção pop-forró alegre sobre a padaria fictícia Pão da Lua, com refrão memorável, voz calorosa e arranjo dançante. Não use letras conhecidas nem referências a artistas reais.',
  },
  {
    id: 'fictional-night-train',
    text: 'Crie uma canção synth-pop suave sobre uma viagem noturna de trem entre duas cidades imaginárias, com clima esperançoso, melodia cantável e produção contemporânea. Não use letras conhecidas nem referências a artistas reais.',
  },
] as const;

type ComparisonCase = {
  id: string;
  provider: MusicProviderName;
  model: string;
  promptHash: string;
};

const comparisonCases = (): ComparisonCase[] =>
  prompts.flatMap(({ id, text }) => {
    const promptHash = createHash('sha256').update(text).digest('hex');
    return [
      { id, provider: 'openrouter' as const, model: OPENROUTER_MODEL, promptHash },
      { id, provider: 'google' as const, model: GOOGLE_MODEL, promptHash },
    ];
  });

const usage = (result: {
  usage: { requestId: string | null; costUsd: string | null; latencyMs: number };
}) => ({
  requestId: result.usage.requestId,
  costUsd: result.usage.costUsd,
  latencyMs: result.usage.latencyMs,
});

const errorCategory = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'category' in error) {
    const category = (error as { category?: unknown }).category;
    if (typeof category === 'string') return category;
  }
  if (typeof error === 'object' && error !== null && 'httpStatus' in error) {
    const status = (error as { httpStatus?: unknown }).httpStatus;
    if (typeof status === 'number') {
      if (status === 402) return 'quota';
      if (status === 408 || status === 429) return 'retryable_http';
      if (status >= 500) return 'provider_http';
      if (status >= 400) return 'rejected_http';
    }
  }
  const message = error instanceof Error ? error.message : '';
  if (/prohibited|safety|content|blocked|refus/i.test(message)) return 'safety';
  if (/no audio/i.test(message)) return 'no_audio';
  if (/timeout|abort/i.test(message)) return 'timeout';
  return 'provider_error';
};

const extensionForMime = (mime: string): string => {
  if (mime === 'audio/mpeg') return 'mp3';
  if (mime === 'audio/wav' || mime === 'audio/wave') return 'wav';
  if (mime === 'audio/ogg') return 'ogg';
  return 'bin';
};

const parseBudget = (args: string[]): number => {
  const index = args.indexOf('--budget-usd');
  if (index < 0) throw new Error('live mode requires --budget-usd');
  const value = Number(args[index + 1]);
  if (
    !Number.isFinite(value) ||
    value < prompts.length * 2 * PRICE_PER_CALL_USD ||
    value > AUTHORIZED_BUDGET_CEILING_USD
  )
    throw new Error('the supplied shared budget must be between 0.32 and 3.00 USD');
  return value;
};

const dryRun = (): void => {
  console.log(
    JSON.stringify(
      {
        mode: 'dry-run',
        calls: comparisonCases(),
        callCount: comparisonCases().length,
        nominalCeilingUsd: prompts.length * 2 * PRICE_PER_CALL_USD,
        networkCalls: 0,
        output: join('output', 'google-lyria-comparison'),
      },
      null,
      2,
    ),
  );
};

const loadEnvFile = (): void => {
  const candidate = (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void })
    .loadEnvFile;
  candidate?.(join(REPO_ROOT, '.env'));
};

const runLive = async (args: string[]): Promise<void> => {
  const budgetUsd = parseBudget(args);
  loadEnvFile();
  const googleApiKey = process.env.GOOGLE_API_KEY?.trim() ?? '';
  const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim() ?? '';
  if (!googleApiKey || !openRouterApiKey)
    throw new Error('live mode requires both provider keys in the server environment');
  const configuredOpenRouterModel = process.env.OPENROUTER_MUSIC_MODEL?.trim() || OPENROUTER_MODEL;
  if (configuredOpenRouterModel !== OPENROUTER_MODEL)
    throw new Error(`comparison requires ${OPENROUTER_MODEL} as the current OpenRouter model`);
  const configuredGoogleModel = process.env.GOOGLE_MUSIC_MODEL?.trim() || GOOGLE_MODEL;
  if (configuredGoogleModel !== GOOGLE_MODEL)
    throw new Error(`comparison requires ${GOOGLE_MODEL} as the selected Google model`);

  const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const outputDir = join(REPO_ROOT, 'output', 'google-lyria-comparison', runId);
  await mkdir(outputDir, { recursive: true });
  const results: Array<Record<string, unknown>> = [];

  for (const item of comparisonCases()) {
    const prompt = prompts.find((candidate) => candidate.id === item.id)?.text;
    if (!prompt) throw new Error('comparison prompt is missing');
    const startedAt = Date.now();
    const result =
      item.provider === 'google'
        ? await generateGoogleMusicOnce({ apiKey: googleApiKey, model: item.model }, prompt)
        : await generateMusicOnce(
            {
              apiKey: openRouterApiKey,
              model: item.model,
              webUrl: process.env.WEB_URL?.trim() || 'http://localhost:5175',
            },
            prompt,
          );
    const base = {
      lyricId: item.id,
      provider: item.provider,
      model: item.model,
      promptHash: item.promptHash,
      elapsedMs: Date.now() - startedAt,
      ...usage(result),
    };
    if (result.ok) {
      const extension = extensionForMime(result.mime);
      const audioPath = join(outputDir, `${item.id}-${item.provider}.${extension}`);
      await writeFile(audioPath, result.bytes);
      results.push({ ...base, status: 'ok', externalId: result.externalId || null, audioPath });
    } else {
      results.push({
        ...base,
        status: (result.error as { category?: string }).category === 'safety' ? 'blocked' : 'error',
        externalId: result.usage.requestId,
        costUsd: result.usage.costUsd,
        errorCategory: errorCategory(result.error),
      });
    }
  }

  await writeFile(
    join(outputDir, 'manifest.json'),
    JSON.stringify(
      {
        mode: 'live',
        budgetProvidedUsd: budgetUsd,
        nominalCeilingUsd: prompts.length * 2 * PRICE_PER_CALL_USD,
        callCount: results.length,
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ mode: 'live', outputDir, callCount: results.length, results }, null, 2),
  );
};

const args = process.argv.slice(2);
if (args.includes('--dry-run') === args.includes('--live'))
  throw new Error('choose exactly one mode: --dry-run or --live');

if (args.includes('--dry-run')) dryRun();
else
  runLive(args).catch((error: unknown) => {
    console.error(JSON.stringify({ errorCategory: errorCategory(error) }));
    process.exitCode = 1;
  });
