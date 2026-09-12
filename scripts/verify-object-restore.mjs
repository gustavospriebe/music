import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, realpath, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const inventory = async (directory, prefix = '') => {
  const entries = await readdir(join(directory, prefix), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const key = join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...(await inventory(directory, key)));
    else if (entry.isFile()) {
      const hash = createHash('sha256');
      for await (const bytes of createReadStream(join(directory, key))) hash.update(bytes);
      result.push({
        key,
        size: (await stat(join(directory, key))).size,
        sha256: hash.digest('hex'),
      });
    } else throw new Error('Object inventory contains an unsupported entry.');
  }
  return result.sort((left, right) => left.key.localeCompare(right.key));
};

/** Compare two restored object exports without logging keys or contents. */
export const verifyObjectRestore = async (source, restored) => {
  if ((await realpath(source)) === (await realpath(restored)))
    throw new Error('Source and restored export must differ.');
  const expected = await inventory(source);
  const actual = await inventory(restored);
  if (!expected.length) throw new Error('An empty object export does not prove recovery.');
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error('Restored objects differ in keys, sizes or SHA-256.');
  return { objects: expected.length, bytes: expected.reduce((sum, item) => sum + item.size, 0) };
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2] || !process.argv[3])
      throw new Error(
        'Usage: node scripts/verify-object-restore.mjs SOURCE_EXPORT RESTORED_EXPORT',
      );
    const result = await verifyObjectRestore(process.argv[2], process.argv[3]);
    process.stdout.write(
      `Object restore verified: ${result.objects} objects, ${result.bytes} bytes; keys and SHA-256 match.\n`,
    );
  } catch {
    process.stderr.write(
      'Object restore verification failed. Check the isolated exports; no private keys or contents were logged.\n',
    );
    process.exitCode = 1;
  }
}
