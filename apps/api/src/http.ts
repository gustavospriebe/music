import { LogController } from 'fastify';

const ADMIN_TZ = 'America/Sao_Paulo';

/** Offset (ms) de `ADMIN_TZ` num instante UTC, via Intl (vale para DST histórico). */
export const tzOffsetMs = (timeZone: string, utcMs: number): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get('hour') === 24 ? 0 : get('hour');
  return (
    Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second')) - utcMs
  );
};

/** Meia-noite de `date` (YYYY-MM-DD) em `ADMIN_TZ`, devolvida como ISO UTC. */
export const spDayStartUtc = (date: string): string => {
  const midnightGuess = Date.parse(`${date}T00:00:00.000Z`);
  let start = midnightGuess - tzOffsetMs(ADMIN_TZ, midnightGuess);
  start = midnightGuess - tzOffsetMs(ADMIN_TZ, start);
  return new Date(start).toISOString();
};

/** Dia corrido seguinte (para o limite exclusivo do `to`). */
export const nextUtcDate = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);

export const httpLogContext = (route: string, statusCode: number, elapsedTime: number) => ({
  route,
  statusCode,
  latencyMs: Math.round(elapsedTime),
});

export const requestLogController = new LogController({ disableRequestLogging: true });

/** Only messages constructed by our HTTP boundary may be returned to a customer. */
export class PublicHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}
