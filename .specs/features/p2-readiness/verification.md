# P2 Readiness Validation

> Registro histórico de um recorte anterior. O modelo vigente e a evidência atual estão em [docs/documentation-map.md](../../../docs/documentation-map.md) e [audit-remediation](../audit-remediation/spec.md). Este registro não autoriza publicação nem gasto com providers.

**Validated:** 2026-09-05T00:59:34Z  
**Implementation range:** `be80987..960b195`  
**Local verdict:** PASS  
**External verdict:** EXTERNAL BLOCKED

## Independent Verdict

An independent verifier reviewed the committed implementation without editing the worktree and returned **PASS: 19/19 requirements, no functional gaps**. The verifier also confirmed that the P2 commits do not include the pre-existing dirty admin file, audit images or runtime logs.

| Requirement | Result | Observable evidence                                                                                                            |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| COVER-01    | PASS   | Owner/payment guards and atomic first attempt in `apps/api/src/app.ts`; concurrency test in `apps/api/src/cover-flow.test.ts`. |
| COVER-02    | PASS   | Two-attempt invariant in API/schema and historical/third-attempt rejection test in `apps/api/src/cover-flow.test.ts`.          |
| COVER-03    | PASS   | Owner, payment, pending and limit rejection branches covered before provider execution.                                        |
| COVER-04    | PASS   | Reference-based model selection and exact OpenRouter request covered in worker unit/integration tests.                         |
| COVER-05    | PASS   | 8 MiB, raster signature/MIME, consent, normalization and random private key covered by API tests.                              |
| COVER-06    | PASS   | Success and terminal-failure reference deletion covered in `apps/worker/src/flow.test.ts`.                                     |
| COVER-07    | PASS   | Stable `cover:<orderId>:<attempt>` job key and provider-once resumption test.                                                  |
| COVER-08    | PASS   | Raster-only parsing plus provider/model/token/cost/latency ledger assertions.                                                  |
| COVER-09    | PASS   | Exact capability-only DTO/download tests expose no internal IDs or storage keys.                                               |
| COVER-10    | PASS   | React and Playwright owner/view-only tests cover AI label, download and regeneration balance.                                  |
| PERF-01     | PASS   | Dynamic route imports and deterministic 500,000-byte entry gate; observed entry 68,641 bytes.                                  |
| PERF-02     | PASS   | Accessible Suspense fallback and route focus retained; public routing covered by Playwright.                                   |
| MAINT-01    | PASS   | Fastify `LogController` and exact sanitized completion-log test.                                                               |
| MAINT-02    | PASS   | React Doctor reports no public warnings; only the pre-existing dirty admin warning remains.                                    |
| OPS-01      | PASS   | Production fail-fast tests require both cover models and explicit persistent private storage.                                  |
| OPS-02      | PASS   | Activation/restore runbook includes command, expected evidence, rollback and acceptance.                                       |
| OPS-03      | PASS   | Terminal/seven-day cleanup tests and legal disclosure with pending legal approval.                                             |
| TEST-01     | PASS   | Complete gates, migrations, E2E, container builds and isolated restore evidence below.                                         |
| TEST-02     | PASS   | Independent 19/19 mapping and killed scratch mutation recorded below.                                                          |

## Local Gate Evidence

| Gate                                       | Result                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm check`                      | PASS: format; 8/8 lint tasks; 8/8 typecheck tasks; 118/118 Vitest tests; 8/8 builds.                                      |
| Test inventory                             | Contracts 8, providers 3, domain 7, web 44, API 36 and worker 20.                                                         |
| PostgreSQL integration outside Turbo cache | PASS: API 36/36 and worker 20/20.                                                                                         |
| `corepack pnpm test:e2e`                   | PASS: Playwright 30/30, including owner/reference and delivery view-only cover flows.                                     |
| Migrations                                 | PASS twice in both `resenha` and `resenha_test`; each reports 7 applied migration records.                                |
| Web bundle                                 | Entry 68,641 B; public route 115.60 kB; React vendor 432.96 kB; entry limit 500,000 B.                                    |
| React Doctor                               | 25 changed files scanned; zero warnings in public files; one pre-existing warning at `apps/web/src/admin/routes.tsx:293`. |
| API container                              | PASS: local image `resenha-api:p2-local` built, not published.                                                            |
| Worker container                           | PASS: local image `resenha-worker:p2-local` built, not published.                                                         |
| Restore drill                              | PASS against isolated disposable database: 29 orders and 7 migrations restored; target removed afterward.                 |
| Structural validator                       | PASS: 19 requirements mapped across 8 tasks.                                                                              |

The first complete E2E run exposed two nested `main` landmarks on the invalid-delivery error page. Commit `960b195` fixed the regression; its focused test and the subsequent 30-test suite both passed.

## Discrimination Sensor

The validator passed on the baseline. In a temporary copy, both `EXTERNAL BLOCKED` markers were removed from the activation runbook. The same validator failed with `AssertionError: missing activation marker: EXTERNAL BLOCKED`. The scratch directory was deleted and the real worktree was not mutated.

## External Boundary

No paid cover request, Mercado Pago sandbox transaction, Resend delivery, managed-S3 operation, deploy or publication was performed. Legal approval was not inferred. Those actions require credentials, infrastructure, budget or a responsible approver and remain **EXTERNAL BLOCKED** under `docs/external-activation-runbook.md`.
