import { describe, expect, it } from 'vitest';
import { validateAudio } from './audio-validation.js';
import { testAudio } from './test-audio.js';
describe('production audio validity', () => {
  it('measures a completely decoded audio longer than the minimum', async () => {
    expect(await validateAudio(testAudio(12))).toEqual({ durationMs: 12_000 });
  });
  it('rejects a header without decodable audio and a truncated container', async () => {
    await expect(
      validateAudio(Buffer.from([0x49, 0x44, 0x33, 0x04, 0, 0, 1, 2])),
    ).rejects.toMatchObject({ code: 'AI_INVALID_AUDIO' });
    await expect(validateAudio(testAudio().subarray(0, 100))).rejects.toMatchObject({
      code: 'AI_INVALID_AUDIO',
    });
  });
  it('rejects a valid but shorter recording before completion', async () => {
    await expect(validateAudio(testAudio(2))).rejects.toMatchObject({ code: 'AI_AUDIO_TOO_SHORT' });
  });
  it('measures the minimum using decoded samples including the final block', async () => {
    expect(await validateAudio(testAudio(10))).toEqual({ durationMs: 10_000 });
    await expect(validateAudio(testAudio(9.999))).rejects.toMatchObject({
      code: 'AI_AUDIO_TOO_SHORT',
    });
  });
});
