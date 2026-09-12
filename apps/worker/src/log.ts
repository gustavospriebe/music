import { type ClaimedJob } from '@resenha/database';
import { sanitizeAiError } from '@resenha/domain';

export const sanitizeError = sanitizeAiError;

export const jobLogContext = (
  job: ClaimedJob,
  status: 'completed' | 'permanently_failed' | 'retry_scheduled',
  durationMs: number,
  error?: unknown,
) => ({
  jobType: job.type,
  status,
  attempt: job.attempts,
  durationMs: Math.max(0, Math.round(durationMs)),
  ...(error === undefined ? {} : { error: sanitizeError(error) }),
});
