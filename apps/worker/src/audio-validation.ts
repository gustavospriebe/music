import { spawn } from 'node:child_process';
import { workerError } from './ai-call.js';

export const MIN_AUDIO_DURATION_MS = 10_000;

/** Decode stdin completely; no user-controlled filename or network protocol reaches FFmpeg. */
export const validateAudio = async (bytes: Buffer): Promise<{ durationMs: number }> => {
  if (!bytes.length || bytes.length > 72_000_000) throw workerError('AI_INVALID_AUDIO');
  const durationMs = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      [
        '-nostdin',
        '-hide_banner',
        '-v',
        'error',
        '-xerror',
        '-protocol_whitelist',
        'pipe',
        '-i',
        'pipe:0',
        '-map',
        '0:a:0',
        '-vn',
        '-sn',
        '-dn',
        '-threads',
        '1',
        '-f',
        'null',
        '-',
        '-progress',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let progress = '';
    let settled = false;
    const finish = (error?: Error, duration?: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(duration!);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(workerError('AI_INVALID_AUDIO'));
    }, 30_000);
    child.stdout.on('data', (chunk: Buffer) => {
      progress = (progress + chunk.toString()).slice(-32_000);
    });
    child.stderr.resume();
    child.stdin.on('error', () => undefined);
    child.once('error', () => finish(workerError('AI_CONFIGURATION_MISSING')));
    child.once('close', (code) => {
      const samples = Array.from(progress.matchAll(/^out_time_us=(\d+)$/gm));
      const duration = Number(samples.at(-1)?.[1] ?? 0) / 1000;
      if (
        code !== 0 ||
        !progress.includes('progress=end') ||
        !Number.isFinite(duration) ||
        duration <= 0
      )
        finish(workerError('AI_INVALID_AUDIO'));
      else finish(undefined, Math.round(duration));
    });
    child.stdin.end(bytes);
  });
  if (durationMs < MIN_AUDIO_DURATION_MS) throw workerError('AI_AUDIO_TOO_SHORT');
  return { durationMs };
};
