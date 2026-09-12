import type { FastifyReply, FastifyRequest } from 'fastify';
import type { StorageProvider, StorageRange } from '@resenha/providers';

/** Single byte range only. Multiple ranges would require a multipart response. */
export const parseByteRange = (header: string, size: number): StorageRange | null => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    return Number.isSafeInteger(suffix) && suffix > 0
      ? { start: Math.max(0, size - suffix), end: size - 1 }
      : null;
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start)
    return null;
  return { start, end: Math.min(size - 1, end) };
};

/** Caller must authorize the order/file before opening the private object. */
export const sendPrivateFile = async (
  request: FastifyRequest,
  reply: FastifyReply,
  storage: StorageProvider,
  file: { storageKey: string; mimeType: string; sizeBytes: number },
) => {
  reply
    .type(file.mimeType)
    .header('accept-ranges', 'bytes')
    .header('cache-control', 'private, no-store');
  const range = request.headers.range
    ? parseByteRange(request.headers.range, file.sizeBytes)
    : undefined;
  if (range === null)
    return reply.code(416).header('content-range', `bytes */${file.sizeBytes}`).send();
  if (range)
    reply.code(206).header('content-range', `bytes ${range.start}-${range.end}/${file.sizeBytes}`);
  reply.header('content-length', range ? range.end - range.start + 1 : file.sizeBytes);
  return reply.send(await storage.open(file.storageKey, range));
};
