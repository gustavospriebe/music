/** A real, decodable PCM tone for isolated tests; never used by a production provider. */
export const testAudio = (seconds = 12): Buffer => {
  const sampleRate = 8000;
  const samples = Math.round(seconds * sampleRate);
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let sample = 0; sample < samples; sample++)
    bytes.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 440 * sample) / sampleRate) * 4000),
      44 + sample * 2,
    );
  return bytes;
};
