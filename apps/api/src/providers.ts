import sharp from 'sharp';

export { createLocalStorage } from '@resenha/providers';

export const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;

export const detectRasterMime = (
  bytes: Buffer,
): 'image/jpeg' | 'image/png' | 'image/webp' | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  )
    return 'image/webp';
  return null;
};

export const normalizeReferenceImage = async (bytes: Buffer, declaredMime: string) => {
  if (!bytes.length || bytes.length > MAX_REFERENCE_IMAGE_BYTES)
    throw new Error('A foto deve ter no máximo 8 MB.');
  const detected = detectRasterMime(bytes);
  if (!detected || detected !== declaredMime)
    throw new Error('Envie uma foto JPEG, PNG ou WebP válida.');
  try {
    return await sharp(bytes, { limitInputPixels: 16_777_216 })
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    throw new Error('Não foi possível validar a foto enviada.');
  }
};
