import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const image = process.argv[2];
if (!image) throw new Error('Usage: node scripts/test-web-proxy.mjs WEB_IMAGE');
const prefix = `music-proxy-${randomUUID()}`;
const network = `${prefix}-network`;
const api = `${prefix}-api`;
const web = `${prefix}-web`;
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' }).trim();
const server = `
require('node:http').createServer(async (req,res)=>{
  if(!req.url.startsWith('/api/v1/probe')) { res.writeHead(404);res.end();return; }
  let length=0;for await(const chunk of req)length+=chunk.length;
  res.setHeader('content-type','application/json');
  res.setHeader('set-cookie','probe=synthetic; Path=/; HttpOnly; SameSite=Lax');
  res.end(JSON.stringify({path:req.url,cookie:req.headers.cookie,range:req.headers.range,length}));
}).listen(3001,'0.0.0.0');`;
try {
  docker('network', 'create', network);
  docker(
    'run',
    '-d',
    '--name',
    api,
    '--network',
    network,
    '--network-alias',
    'api',
    'node:22-alpine',
    'node',
    '-e',
    server,
  );
  docker(
    'run',
    '-d',
    '--name',
    web,
    '--network',
    network,
    '-p',
    '127.0.0.1::8080',
    '-e',
    'API_UPSTREAM=http://api:3001',
    image,
  );
  const port = docker('port', web, '8080/tcp').split(':').at(-1);
  const base = `http://127.0.0.1:${port}`;
  let available = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch(base)).ok) {
        available = true;
        break;
      }
    } catch {
      /* Starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(available, 'Web container starts');
  const response = await fetch(`${base}/api/v1/probe?variant=2`, {
    method: 'POST',
    headers: { cookie: 'probe=synthetic', range: 'bytes=0-1023' },
    body: 'x'.repeat(1_100_000),
  });
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get('set-cookie'),
    /probe=synthetic; Path=\/; HttpOnly; SameSite=Lax/,
  );
  assert.deepEqual(await response.json(), {
    path: '/api/v1/probe?variant=2',
    cookie: 'probe=synthetic',
    range: 'bytes=0-1023',
    length: 1_100_000,
  });
  assert.equal(
    (await fetch(`${base}/api/v1/absent`)).status,
    404,
    'API failures never become SPA HTML',
  );
  assert.equal((await fetch(`${base}/pedido/synthetic`)).status, 200, 'SPA navigation works');
  console.log('Production web proxy PASS: path/query, cookies, Range, upload, API 404 and SPA.');
} finally {
  for (const name of [web, api]) {
    try {
      docker('rm', '-f', name);
    } catch {
      /* May not have started. */
    }
  }
  try {
    docker('network', 'rm', network);
  } catch {
    /* May not have been created. */
  }
}
