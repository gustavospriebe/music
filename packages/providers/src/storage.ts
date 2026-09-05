import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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

export type StorageConfig =
  | { kind: 'local'; basePath: string }
  | {
      kind: 's3';
      bucket: string;
      region: string;
      endpoint?: string;
      forcePathStyle: boolean;
      credentials?: { accessKeyId: string; secretAccessKey: string };
    };

type StorageCommand = PutObjectCommand | GetObjectCommand | DeleteObjectCommand;
export type StorageCommandSender = { send: (command: StorageCommand) => Promise<unknown> };

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

type StorageEnvironment = {
  NODE_ENV?: string;
  STORAGE_PROVIDER?: string;
  LOCAL_STORAGE_PATH?: string;
  STORAGE_S3_BUCKET?: string;
  STORAGE_S3_REGION?: string;
  STORAGE_S3_ENDPOINT?: string;
  STORAGE_S3_FORCE_PATH_STYLE?: string;
  STORAGE_S3_ACCESS_KEY_ID?: string;
  STORAGE_S3_SECRET_ACCESS_KEY?: string;
};

export const readStorageConfig = (env: StorageEnvironment): StorageConfig => {
  const production = env.NODE_ENV === 'production';
  const kind = env.STORAGE_PROVIDER || 'local';
  if (production && kind !== 's3') throw new Error('STORAGE_PROVIDER=s3 is required in production');
  if (kind === 'local') return { kind, basePath: env.LOCAL_STORAGE_PATH ?? './var/storage' };
  if (kind !== 's3') throw new Error('STORAGE_PROVIDER must be local or s3');
  const accessKeyId = env.STORAGE_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.STORAGE_S3_SECRET_ACCESS_KEY?.trim();
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey))
    throw new Error('Both S3 access key settings are required when either is configured');
  return {
    kind,
    bucket: required(env, 'STORAGE_S3_BUCKET'),
    region: required(env, 'STORAGE_S3_REGION'),
    ...(env.STORAGE_S3_ENDPOINT ? { endpoint: env.STORAGE_S3_ENDPOINT } : {}),
    forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE === 'true',
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  };
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

export const createS3Storage = (
  config: Extract<StorageConfig, { kind: 's3' }>,
  sender?: StorageCommandSender,
): StorageProvider => {
  const client = sender
    ? null
    : new S3Client({
        region: config.region,
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
        forcePathStyle: config.forcePathStyle,
        ...(config.credentials ? { credentials: config.credentials } : {}),
      });
  const send = (command: StorageCommand) =>
    sender ? sender.send(command) : client!.send(command as PutObjectCommand);
  return {
    put: async (key, data, mime) => {
      await send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: data,
          ContentType: mime,
        }),
      );
      return { key, size: data.length, mime };
    },
    get: async (key) => {
      const result = (await send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))) as {
        Body?: { transformToByteArray?: () => Promise<Uint8Array> };
      };
      if (!result.Body?.transformToByteArray) throw new Error('S3 object body is unavailable');
      return Buffer.from(await result.Body.transformToByteArray());
    },
    delete: async (key) => {
      await send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
};

export const createStorage = (config: StorageConfig): StorageProvider =>
  config.kind === 'local' ? createLocalStorage(config.basePath) : createS3Storage(config);
