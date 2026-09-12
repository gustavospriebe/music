# Google Lyria 3.5 Integration Tasks

> Registro histórico de um recorte anterior. O modelo vigente e a evidência atual estão em [docs/documentation-map.md](../../../docs/documentation-map.md) e [audit-remediation](../audit-remediation/spec.md). Este registro não autoriza publicação nem gasto com providers.

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: activate it by name and follow its Execute flow and Critical Rules. Do not commit, push, deploy or publish without explicit authorization.

**Design**: `.specs/features/google-lyria-integration/design.md`
**Status**: In Progress — T1–T7 implemented and locally gated; authorized live comparison completed; human listening and final independent verification remain.

## Test Coverage Matrix

> Generated from `AGENTS.md`, `package.json`, workspace manifests, Vitest tests, CI workflow, and the feature spec. Existing tests are present; the project requires format, lint, typecheck, tests and build through `pnpm check`.

| Code Layer                                  | Required Test Type | Coverage Expectation                                                                                                              | Location Pattern                                        | Run Command                                                                                                                                                           |
| ------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker configuration and provider transport | unit               | Both provider selections, request contract, audio decoding, missing config, terminal/retry errors and sanitized outcomes          | `apps/worker/src/worker.test.ts`                        | `env PATH=/Users/gustavopriebe/.nvm/versions/node/v22.22.2/bin:$PATH corepack pnpm --filter @resenha/worker exec vitest run src/worker.test.ts`                       |
| Worker job persistence and state            | integration        | Provider/model/cost/error per attempt, legacy job compatibility, partial variant recovery and unchanged order/storage transitions | `apps/worker/src/flow.test.ts`                          | `env PATH=/Users/gustavopriebe/.nvm/versions/node/v22.22.2/bin:$PATH corepack pnpm --filter @resenha/worker exec vitest run src/flow.test.ts`                         |
| API environment and job enqueue             | integration        | Google/OpenRouter validation plus new-job payload snapshot without credentials                                                    | `apps/api/src/env.test.ts`, `apps/api/src/flow.test.ts` | `env PATH=/Users/gustavopriebe/.nvm/versions/node/v22.22.2/bin:$PATH corepack pnpm --filter @resenha/api test`                                                        |
| Admin recovery                              | integration        | Retry preserves selection; variant/full regeneration does not silently mix providers                                              | `apps/api/src/admin-recovery.test.ts`                   | `env PATH=/Users/gustavopriebe/.nvm/versions/node/v22.22.2/bin:$PATH corepack pnpm --filter @resenha/api exec vitest run src/admin-recovery.test.ts`                  |
| Comparison CLI                              | smoke              | Dry-run guard, exact four-call cost ceiling, identical-prompt hash and no-secret output                                           | `scripts/compare-music-models.ts`                       | `env PATH=/Users/gustavopriebe/.nvm/versions/node/v22.22.2/bin:$PATH corepack pnpm --filter @resenha/worker exec tsx ../../scripts/compare-music-models.ts --dry-run` |
| Configuration/docs                          | none               | Build/typecheck and `git diff --check`; no network or provider call                                                               | `.env.example`, `scripts/local-preview.sh`, `docs/`     | build gate only                                                                                                                                                       |

## Gate Check Commands

| Gate Level  | When to Use                                | Command                                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quick       | After worker/API unit changes              | `env PATH=/Users/gustavopriebe/.nvm/versions/node/v22.22.2/bin:$PATH corepack pnpm --filter @resenha/worker exec vitest run src/worker.test.ts` and `env PATH=/Users/gustavopriebe/.nvm/versions/node/v22.22.2/bin:$PATH corepack pnpm --filter @resenha/api exec vitest run src/env.test.ts` |
| Integration | After persistence/enqueue/recovery changes | `env PATH=/Users/gustavopriebe/.nvm/versions/node/v22.22.2/bin:$PATH corepack pnpm --filter @resenha/api test` and `env PATH=/Users/gustavopriebe/.nvm/versions/node/v22.22.2/bin:$PATH corepack pnpm --filter @resenha/worker exec vitest run src/flow.test.ts`                              |
| Full        | Before feature verification                | `env PATH=/Users/gustavopriebe/.nvm/versions/node/v22.22.2/bin:$PATH corepack pnpm check`                                                                                                                                                                                                     |
| CLI smoke   | Before any paid comparison                 | `env PATH=/Users/gustavopriebe/.nvm/versions/node/v22.22.2/bin:$PATH corepack pnpm --filter @resenha/worker exec tsx ../../scripts/compare-music-models.ts --dry-run`                                                                                                                         |

## Execution Plan

Phases are ordered and run sequentially. Tasks within a phase are sequential unless their file ownership is disjoint and the orchestrator explicitly dispatches them in parallel.

### Phase 1: Foundation

```
T1 → T2 → T3
```

### Phase 2: Job and recovery integration

```
T4 → T5 → T6
```

### Phase 3: Controlled comparison

```
T7
```

## Task Breakdown

### T1: Add provider-aware API environment validation

**What**: Extend API environment parsing to accept `MUSIC_PROVIDER=google`, validate the selected credential/model in production, and preserve OpenRouter defaults; update its co-located tests.
**Where**: `apps/api/src/env.ts`
**Depends on**: None
**Reuses**: Existing Zod schema and production validation.
**Requirement**: GLY-01, GLY-02, GLY-05

**Tools**:

- Local: `rg`, Vitest, TypeScript
- Skill: `tlc-spec-driven`

**Done when**:

- [x] `MUSIC_PROVIDER` accepts only `openrouter` or `google` and defaults to `openrouter`.
- [x] Google production selection requires `GOOGLE_API_KEY`; OpenRouter production selection retains its current requirements.
- [x] `GOOGLE_MUSIC_MODEL` defaults to `lyria-3.5` without exposing a secret.
- [x] `apps/api/src/env.test.ts` covers both selections, missing selected credentials and unchanged defaults.
- [x] Quick gate passes with no test deletions.

**Tests**: unit
**Gate**: quick

### T2: Implement the Google music adapter and worker selection

**What**: Add Google Interactions transport, response normalization, error classification, provider metadata and worker configuration/factory while retaining the OpenRouter adapter.
**Where**: `apps/worker/src/worker.ts`
**Depends on**: T1
**Reuses**: `MusicProvider`, `MusicResult`, `detectAudioMime`, timeout and sanitization seams.
**Requirement**: GLY-01, GLY-02, GLY-05, GLY-06, GLY-07, GLY-08, GLY-09, GLY-10

**Tools**:

- Local: `rg`, mocked `fetch`, Vitest, TypeScript
- Skill: `tlc-spec-driven`

**Done when**:

- [x] Google calls the documented Interactions endpoint with `x-goog-api-key`, selected model, common prompt and `store:false`.
- [x] The parser accepts documented `output_audio` and `steps[].content[]` audio blocks and detects the returned container.
- [x] Successful Google usage has provider/model/request id/latency and `0.08` USD; failure usage does not claim unknown spend as zero.
- [x] Google HTTP 408/429/5xx remain retryable and other 4xx/safety/no-audio failures are terminal and sanitized.
- [x] `apps/worker/src/worker.test.ts` proves request/body/header redaction and all listed outcomes with mocked fetch only.
- [x] Quick gate passes with no paid network call.

**Tests**: unit
**Gate**: quick

### T3: Expose selected provider in local preview safely

**What**: Make the preview launcher load only the selected Google or OpenRouter server-side settings and document the new variables without editing `.env` or exposing keys to web.
**Where**: `scripts/local-preview.sh`
**Depends on**: T2
**Reuses**: Existing `PREVIEW_AI` opt-in, isolated database and `--check` output.
**Requirement**: GLY-01, GLY-05, GLY-16

**Tools**:

- Local: shell, `dotenv` parser, `git diff --check`
- Skill: `tlc-spec-driven`

**Done when**:

- [x] API and worker preview processes receive only their selected server-side provider key/model.
- [x] `MUSIC_PROVIDER=google` selects `GOOGLE_API_KEY`/`GOOGLE_MUSIC_MODEL` and does not invent an OpenRouter slug.
- [x] Web preview never receives either provider key.
- [x] `.env.example` documents Google variables and the explicit selection.
- [x] `PREVIEW_AI=off ... --check` remains deterministic and the CLI smoke command has no network side effect.

**Tests**: none
**Gate**: build

### T4: Persist provider/model metadata through worker audio jobs

**What**: Resolve provider/model from a job payload with legacy OpenRouter fallback and replace fixed audio/usage provider literals while preserving storage, review, retry and delivery transitions.
**Where**: `apps/worker/src/worker.ts`
**Depends on**: T2, T3
**Reuses**: Existing `processAudioJob`, `recordAudioUsage`, PostgreSQL JSON payload and `MusicProvider` test seam.
**Requirement**: GLY-03, GLY-04, GLY-08, GLY-10, GLY-11

**Tools**:

- Local: PostgreSQL test database, Vitest, SQL assertions
- Skill: `tlc-spec-driven`

**Done when**:

- [x] Legacy `{}` jobs use OpenRouter and selected jobs use the payload provider/model.
- [x] `audio_generations` and `ai_usage` record the actual provider/model for each attempt.
- [x] Google success cost and sanitized failures reach the same ledger without changing order/storage transitions.
- [x] `apps/worker/src/flow.test.ts` covers success, blocked/error, partial variant recovery and legacy compatibility.
- [x] Integration gate passes on the disposable test database.

**Tests**: integration
**Gate**: integration

### T5: Snapshot provider selection on new audio jobs

**What**: Include the current non-secret provider/model selection when API payment confirmation creates a new `generate_audio` job, while keeping payload-free legacy fixtures compatible.
**Where**: `apps/api/src/app.ts`
**Depends on**: T4
**Reuses**: Existing Mercado Pago/dev-payment transactions and `generationJobs` JSON payload.
**Requirement**: GLY-03, GLY-04

**Tools**:

- Local: Fastify inject, PostgreSQL test database, SQL assertions
- Skill: `tlc-spec-driven`

**Done when**:

- [x] Mercado Pago and development payment paths persist provider/model metadata, never credentials or lyrics.
- [x] New Google-selected jobs persist `provider: google` and `model: lyria-3.5`.
- [x] Existing API flow tests assert the payload and preserve idempotency.
- [x] Integration gate passes.

**Tests**: integration
**Gate**: integration

### T6: Preserve selection through administrative recovery

**What**: Keep retry payloads unchanged and snapshot a safe provider/model for variant/full audio replacements so recovery does not silently mix suppliers.
**Where**: `apps/api/src/app.ts`
**Depends on**: T5
**Reuses**: Existing `enqueueAudioReplacement`, `audioGenerations`, `jobRecovery` and admin notes.
**Requirement**: GLY-04, GLY-11, GLY-16

**Tools**:

- Local: Fastify inject, PostgreSQL test database, admin recovery tests
- Skill: `tlc-spec-driven`

**Done when**:

- [x] Retrying a failed job updates status/attempts only and preserves its provider/model payload.
- [x] Regenerating one variant reuses the existing selected/paired provider/model when available.
- [x] Full rebuild uses the current explicit configuration and stores no credential.
- [x] `apps/api/src/admin-recovery.test.ts` asserts exact sanitized payloads and existing recovery authorization behavior.
- [x] Integration gate passes.

**Tests**: integration
**Gate**: integration

### T7: Add a budget-guarded controlled comparison harness

Implementation and the dry-run gate pass. The authorized live comparison completed on 2026-09-08 with four successful calls; human listening remains pending.

**What**: Add a non-production CLI that sends two fixed fictional lyric prompts once to current Lyria 3 Pro and Google Lyria 3.5, saves audio/sanitized metadata under ignored output, and documents technical results separately from human acceptance.
**Where**: `scripts/compare-music-models.ts`
**Depends on**: T3, T4, T5, T6
**Reuses**: Exported one-call provider seams and dotenv loading; no database or existing order.
**Requirement**: GLY-12, GLY-13, GLY-14, GLY-15, GLY-16

**Tools**:

- Local: `tsx`, SHA-256, filesystem output under `output/`
- Skill: `tlc-spec-driven`

**Done when**:

- [x] `--dry-run` performs no fetch and shows the exact four-call nominal ceiling of US$0.32.
- [x] Live mode requires an explicit flag, a caller-supplied remaining shared budget of at least US$0.32, and both server-side keys; no key or lyric is printed.
- [x] Each model/lyric pair was called exactly once with the same prompt hash; adapter retries were not used. Evidence: `output/google-lyria-comparison/2026-09-08T12-14-53-374Z/manifest.json`.
- [x] Output metadata includes provider/model/status/external id/latency/cost/error category and omits prompt text/secrets.
- [x] `docs/google-lyria-comparison.md` records whether the real run happened, technical evidence, human-listening status and limitations; it does not declare a new default.
- [x] CLI smoke gate passes before any live run.

**Tests**: smoke
**Gate**: CLI smoke

## Traceability and Verification Tables

### Requirement-to-task map

| Requirement | Tasks      | Status                                                  |
| ----------- | ---------- | ------------------------------------------------------- |
| GLY-01      | T1, T2, T3 | Implemented; independent review recorded                |
| GLY-02      | T1, T2     | Implemented; independent review recorded                |
| GLY-03      | T4, T5     | Implemented; independent review recorded                |
| GLY-04      | T4, T5, T6 | Implemented; independent review recorded                |
| GLY-05      | T1, T2, T3 | Implemented; independent review recorded                |
| GLY-06      | T2         | Implemented; independent review recorded                |
| GLY-07      | T2         | Implemented; independent review recorded                |
| GLY-08      | T2, T4     | Implemented; independent review recorded                |
| GLY-09      | T2         | Implemented; independent review recorded                |
| GLY-10      | T2, T4     | Implemented; independent review recorded                |
| GLY-11      | T4, T6     | Implemented; independent review recorded                |
| GLY-12      | T7         | Live evidence captured; human listening pending         |
| GLY-13      | T7         | Live evidence captured; human listening pending         |
| GLY-14      | T7         | Live evidence captured; human listening pending         |
| GLY-15      | T7         | Technical evidence documented; human listening pending  |
| GLY-16      | T3, T6, T7 | Implemented; independent review PARTIAL; sensor pending |

**Coverage**: 16 total, 16 mapped to tasks, 0 unmapped.

### Task granularity check

| Task | Scope                                                  | Status      |
| ---- | ------------------------------------------------------ | ----------- |
| T1   | One environment boundary plus its co-located tests     | ✅ Granular |
| T2   | One worker provider boundary plus its unit tests       | ✅ Granular |
| T3   | One preview configuration boundary plus documentation  | ✅ Granular |
| T4   | One worker persistence boundary plus integration tests | ✅ Granular |
| T5   | One API enqueue boundary plus flow tests               | ✅ Granular |
| T6   | One API recovery boundary plus recovery tests          | ✅ Granular |
| T7   | One comparison CLI and its evidence contract           | ✅ Granular |

### Diagram-definition cross-check

| Task | Depends on     | Diagram shows            | Status |
| ---- | -------------- | ------------------------ | ------ |
| T1   | None           | None                     | ✅     |
| T2   | T1             | T1 → T2                  | ✅     |
| T3   | T2             | T2 → T3                  | ✅     |
| T4   | T2, T3         | T2/T3 → T4 (cross-phase) | ✅     |
| T5   | T4             | T4 → T5                  | ✅     |
| T6   | T5             | T5 → T6                  | ✅     |
| T7   | T3, T4, T5, T6 | Cross-phase dependencies | ✅     |

### Test co-location validation

| Task | Code layer               | Matrix requires | Task says   | Status |
| ---- | ------------------------ | --------------- | ----------- | ------ |
| T1   | API environment          | unit            | unit        | ✅     |
| T2   | Worker transport/config  | unit            | unit        | ✅     |
| T3   | Configuration/docs       | none            | none        | ✅     |
| T4   | Worker persistence/state | integration     | integration | ✅     |
| T5   | API enqueue              | integration     | integration | ✅     |
| T6   | Admin recovery           | integration     | integration | ✅     |
| T7   | Comparison CLI           | smoke           | smoke       | ✅     |

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1: T1 → T2 → T3
Phase 2: T4 → T5 → T6
Phase 3: T7
```
