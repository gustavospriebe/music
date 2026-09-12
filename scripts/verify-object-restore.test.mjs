import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyObjectRestore } from './verify-object-restore.mjs';

test('restore verifies every object and rejects same-size corrupted bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'music-object-drill-'));
  const source = join(directory, 'source');
  const restored = join(directory, 'restored');
  try {
    await mkdir(join(source, 'audio'), { recursive: true });
    await writeFile(join(source, 'audio', 'synthetic.wav'), Buffer.from([1, 2, 3, 4]));
    await cp(source, restored, { recursive: true });
    assert.deepEqual(await verifyObjectRestore(source, restored), { objects: 1, bytes: 4 });
    await assert.rejects(verifyObjectRestore(source, source));
    await writeFile(join(restored, 'audio', 'synthetic.wav'), Buffer.from([1, 2, 9, 4]));
    await assert.rejects(verifyObjectRestore(source, restored), /differ/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
