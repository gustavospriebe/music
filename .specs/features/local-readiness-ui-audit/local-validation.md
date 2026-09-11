# Local Validation Evidence

**Date**: 2026-09-06  
**Environment**: macOS, Node.js 22.22.2, pnpm 12.3.4  
**Result**: PASS within the boundaries below

## Package-manager migration

- `package.json` pins `pnpm@12.3.4`.
- `pnpm-lock.yaml` is the pnpm 12 canonical two-document lockfile: environment metadata first and the workspace project graph second.
- `corepack pnpm install --lockfile-only`: PASS.
- `corepack pnpm install --frozen-lockfile`: PASS.
- A second frozen install left the lockfile byte-stable.
- Ruby YAML parsing found 2 documents, 11 workspace importers and the pnpm 12.3.4 environment pin.
- `pnpm-workspace.yaml` permits only the locked esbuild versions and denies the optional MSW postinstall.

## Disposable database

- Container: `music-audit-pg-20260906`.
- PostgreSQL exposed only for the audit at `127.0.0.1:55440`.
- Databases: `resenha_audit` and `resenha_audit_test`.
- Migrations: PASS in both databases.
- Seed: PASS; 3 active products and 1 local admin account.

## Automated gates

All commands ran with Node.js 22.22.2 and the disposable PostgreSQL instance.

| Gate                                       | Result | Evidence                                                                      |
| ------------------------------------------ | ------ | ----------------------------------------------------------------------------- |
| `pnpm format:check`                        | PASS   | Entire workspace accepted; pnpm-generated lockfile is excluded from Prettier. |
| `pnpm lint`                                | PASS   | 8 Turbo tasks.                                                                |
| `pnpm typecheck`                           | PASS   | 8 Turbo tasks.                                                                |
| `pnpm exec turbo run test --concurrency=1` | PASS   | 12 tasks, 119 tests.                                                          |
| `pnpm build`                               | PASS   | 8 Turbo tasks; web entry 52,891 bytes.                                        |
| `pnpm test:e2e`                            | PASS   | 30/30 Playwright scenarios.                                                   |

## Docker builds

No-cache builds passed for all three production images under pnpm 12.3.4:

- `music-audit-web:pnpm12`
- `music-audit-api:pnpm12`
- `music-audit-worker:pnpm12`

The install logs showed successful postinstall execution for the locked esbuild versions `0.18.20`, `0.25.12` and `0.28.1`.

## Isolated runtime smoke

- Web: `http://127.0.0.1:5185`.
- API: `http://127.0.0.1:3011`.
- Worker: started against the disposable database with manual review and local storage.
- `GET /api/v1/health/live`: `{"status":"ok"}`.
- `GET /api/v1/health/ready`: `{"status":"ok"}`.
- `GET /api/v1/products`: 3 active products.
- Browser audit created one synthetic local order and a synthetic lyric fixture to inspect review and checkout states.
- Final audit counters: `ai_usage=0`, `payments=0`, `jobs=0`.

## Boundaries

- No OpenRouter generation, Mercado Pago checkout, Resend delivery or production storage call was made.
- The worker used a non-secret sentinel key only because its startup contract requires a value; no job was enqueued.
- The Browser did not click generation, payment, retry, rebuild, audio approval or delivery actions.
- The existing processes on ports 5175 and 3001 and the existing `music-postgres-1` container were not stopped or modified.
- Automated gates are not human UAT, provider validation, Railway deployment or production acceptance.
