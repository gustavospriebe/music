import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

export type StorageProvider = {
  put: (
    key: string,
    data: Buffer,
    mime: string,
  ) => Promise<{ key: string; size: number; mime: string }>;
  get: (key: string) => Promise<Buffer>;
  delete: (key: string) => Promise<void>;
};

export type StorageConfig = { kind: 'local'; basePath: string };

type StorageEnvironment = {
  NODE_ENV?: string;
  STORAGE_PROVIDER?: string;
  LOCAL_STORAGE_PATH?: string;
};

export const readStorageConfig = (env: StorageEnvironment): StorageConfig => {
  const kind = env.STORAGE_PROVIDER || 'local';
  if (kind !== 'local') throw new Error('STORAGE_PROVIDER must be local');
  const basePath = env.LOCAL_STORAGE_PATH ?? './var/storage';
  if (env.NODE_ENV === 'production' && !basePath.startsWith('/'))
    throw new Error('LOCAL_STORAGE_PATH must be absolute in production');
  return { kind, basePath };
};

const safeTarget = (basePath: string, key: string): string => {
  if (!key || key.includes('\\')) throw new Error('Invalid storage key');
  const root = resolve(basePath);
  const target = resolve(root, key);
  const fromRoot = relative(root, target);
  if (!fromRoot || fromRoot.startsWith('..') || fromRoot.startsWith('/'))
    throw new Error('Invalid storage key');
  return target;
};

export const createLocalStorage = (basePath: string): StorageProvider => ({
  put: async (key, data, mime) => {
    const target = safeTarget(basePath, key);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, data);
    return { key, size: data.length, mime };
  },
  get: (key) => readFile(safeTarget(basePath, key)),
  delete: async (key) => rm(safeTarget(basePath, key), { force: true }),
});

export const createStorage = (config: StorageConfig): StorageProvider =>
  createLocalStorage(config.basePath);
