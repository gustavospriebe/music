#!/usr/bin/env bash
# Isolated local development. Paid AI is opt-in; .env is parsed, never sourced.
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_ENV=development
export DATABASE_URL=postgresql://resenha:resenha@localhost:5433/music_launch_preview
export PORT=3010 API_PORT=3010 WEB_URL=http://localhost:5180
export API_URL=http://127.0.0.1:3010 VITE_API_URL=
export COOKIE_SECRET=local-preview-cookie-secret-not-for-production-2026
export CUSTOMER_ACCESS_TOKEN_PEPPER=local-preview-token-pepper-not-for-production-2026
export ADMIN_EMAIL=admin@example.test ADMIN_PASSWORD=local-preview-only-2026
export PAYMENT_PROVIDER=disabled EMAIL_PROVIDER=local-log AUDIO_REVIEW_MODE=manual
export COMMERCIAL_READY=false SONG_PRICE_CENTS=0
export OPENROUTER_TEXT_MAX_TOKENS=8192
export OPENROUTER_API_KEY= OPENROUTER_TEXT_MODEL= OPENROUTER_MUSIC_MODEL=
export MUSIC_PROVIDER=openrouter GOOGLE_API_KEY= GOOGLE_MUSIC_MODEL=lyria-3.5
export OPENROUTER_COVER_TEXT_MODEL= OPENROUTER_COVER_REFERENCE_MODEL=
export RESEND_API_KEY= EMAIL_FROM='Música da Resenha <preview@example.test>'
export STORAGE_PROVIDER=local LOCAL_STORAGE_PATH="$PWD/output/launch-remodel/storage"
export LOCAL_EMAIL_PATH="$PWD/output/launch-remodel/emails"
export WORKER_ID=music-local-preview WORKER_POLL_INTERVAL_MS=2000
# Requires explicit owner approval and a budget before starting either paid mode.
# PREVIEW_AI=lyrics: API text + worker lyrics. PREVIEW_AI=lyrics-audio: text + worker audio.
# PREVIEW_AI=all also enables covers in API + worker; web never receives credentials.
# Payments and real email remain off. --check prints only availability booleans.
exec node --input-type=module - "${1:-}" "${2:-}" <<'JS'
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const [service, option] = process.argv.slice(2);
const mode = process.env.PREVIEW_AI ?? 'off';
const commands = {
  api: ['--filter', '@resenha/api', 'dev'],
  web: ['--filter', '@resenha/web', 'exec', 'vite', '--host', '127.0.0.1', '--port', '5180', '--strictPort'],
  worker: mode === 'off'
    ? ['--filter', '@resenha/worker', 'dev']
    : ['--filter', '@resenha/worker', 'exec', 'tsx', 'src/index.ts'],
};
if (!Object.hasOwn(commands, service) || !['off', 'lyrics', 'lyrics-audio', 'all'].includes(mode) || !['', '--check'].includes(option)) {
  console.error('Usage: PREVIEW_AI=off|lyrics|lyrics-audio|all bash scripts/local-preview.sh api|web|worker [--check]');
  process.exit(2);
}
if (mode !== 'off' && (service === 'api' || (service === 'worker' && ['lyrics', 'lyrics-audio', 'all'].includes(mode)))) {
  const require = createRequire(`${process.cwd()}/apps/api/package.json`);
  let source;
  try { source = require('dotenv').parse(readFileSync('.env')); }
  catch { console.error('Unable to read local .env for the selected AI preview mode.'); process.exit(1); }
  const provider = source.MUSIC_PROVIDER?.trim() || 'openrouter';
  if (!['openrouter', 'google'].includes(provider)) {
    console.error('Invalid preview MUSIC_PROVIDER: expected openrouter or google.');
    process.exit(1);
  }
  process.env.MUSIC_PROVIDER = provider;
  const selected = service === 'api'
    ? ['OPENROUTER_API_KEY', 'OPENROUTER_TEXT_MODEL']
    : [];
  const musicKey = provider === 'google' ? 'GOOGLE_API_KEY' : 'OPENROUTER_API_KEY';
  const musicModel = provider === 'google' ? 'GOOGLE_MUSIC_MODEL' : 'OPENROUTER_MUSIC_MODEL';
  if (service === 'worker' && ['lyrics', 'lyrics-audio', 'all'].includes(mode))
    selected.push('OPENROUTER_API_KEY', 'OPENROUTER_TEXT_MODEL');
  if (service === 'worker' && ['lyrics-audio', 'all'].includes(mode)) selected.push(musicKey);
  if (service === 'worker' && ['lyrics-audio', 'all'].includes(mode) && provider === 'openrouter')
    selected.push(musicModel);
  if (service === 'worker' && mode === 'all') selected.push('OPENROUTER_API_KEY');
  if (mode === 'all') selected.push('OPENROUTER_COVER_TEXT_MODEL', 'OPENROUTER_COVER_REFERENCE_MODEL');
  const missing = selected.filter((name) => !source[name]?.trim());
  if (missing.length) { console.error(`Missing preview settings: ${missing.join(', ')}`); process.exit(1); }
  process.env.GOOGLE_MUSIC_MODEL = source.GOOGLE_MUSIC_MODEL?.trim() || 'lyria-3.5';
  for (const name of selected) process.env[name] = source[name].trim();
}
if (option === '--check') {
  console.log(JSON.stringify({
    service, aiMode: mode, textMaxTokens: Number(process.env.OPENROUTER_TEXT_MAX_TOKENS),
    musicProvider: process.env.MUSIC_PROVIDER,
    lyricsConfigured: Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_TEXT_MODEL),
    audioConfigured: Boolean(
      process.env.MUSIC_PROVIDER === 'google'
        ? process.env.GOOGLE_API_KEY && process.env.GOOGLE_MUSIC_MODEL
        : process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MUSIC_MODEL,
    ),
    coversConfigured: Boolean(process.env.OPENROUTER_COVER_TEXT_MODEL || process.env.OPENROUTER_COVER_REFERENCE_MODEL),
    paymentProvider: process.env.PAYMENT_PROVIDER, emailProvider: process.env.EMAIL_PROVIDER,
  }));
  process.exit(0);
}
const child = spawn('corepack', ['pnpm', ...commands[service]], { stdio: 'inherit', env: process.env });
child.once('error', () => { console.error('Unable to start the selected preview service.'); process.exit(1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('exit', (code) => process.exit(code ?? 1));
JS
