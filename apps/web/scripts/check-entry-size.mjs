import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const limit = 500_000;
const assets = join(process.cwd(), 'dist', 'assets');
const entries = (await readdir(assets)).filter((name) => /^index-[\w-]+\.js$/.test(name));
if (entries.length !== 1) throw new Error(`Expected one web entry chunk, found ${entries.length}`);
const entry = join(assets, entries[0]);
const bytes = (await stat(entry)).size;
if (bytes >= limit) throw new Error(`Web entry is ${bytes} bytes; limit is ${limit}`);
console.log(`PASS: web entry ${bytes} bytes (< ${limit})`);
