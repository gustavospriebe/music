import { spawn } from 'node:child_process';
import { workerError } from './ai-call.js';

export const MIN_AUDIO_DURATION_MS = 10_000;
const MEASUREMENT_SAMPLE_RATE = 8000;
const PCM_BYTES_PER_SAMPLE = 2;

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
        '-ac',
        '1',
        '-ar',
        String(MEASUREMENT_SAMPLE_RATE),
        '-c:a',
        'pcm_s16le',
        '-f',
        's16le',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    // Older FFmpeg progress reports can omit the final packet's duration.
    // Count the complete decoded PCM stream without retaining its contents.
    let decodedBytes = 0;
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
      decodedBytes += chunk.length;
    });
    child.stderr.resume();
    child.stdin.on('error', () => undefined);
    child.once('error', () => finish(workerError('AI_CONFIGURATION_MISSING')));
    child.once('close', (code) => {
      const duration = (decodedBytes * 1000) / PCM_BYTES_PER_SAMPLE / MEASUREMENT_SAMPLE_RATE;
      if (
        code !== 0 ||
        decodedBytes % PCM_BYTES_PER_SAMPLE !== 0 ||
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
