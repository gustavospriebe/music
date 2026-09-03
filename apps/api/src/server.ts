import dotenv from 'dotenv';
import { buildApp } from './app.js';
import { parseEnv } from './env.js';
dotenv.config({ path: new URL('../../../.env', import.meta.url).pathname });
const env = parseEnv();
const app = await buildApp(env);
await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
