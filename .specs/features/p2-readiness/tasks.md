# P2 Readiness Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** The feature uses `frontend-design` for the cover UI and `react-doctor` at completion.

**Design**: `.specs/features/p2-readiness/design.md`  
**Status**: Approved by the owner's autonomous execution request

## Test Coverage Matrix

> Generated from `AGENTS.md`, `README.md`, `.github/workflows/ci.yml`, `package.json`, the feature spec and existing Vitest/Fastify/Playwright samples.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Contracts and image validation | unit | Every accepted/rejected shape, size, status and exact public DTO | `packages/contracts/src/*.test.ts`, `apps/api/src/*.test.ts` | `corepack pnpm test` |
| PostgreSQL persistence | integration | Attempt limit, concurrency, job idempotency, history and cleanup on real PostgreSQL | `apps/{api,worker}/src/*flow.test.ts` | `corepack pnpm test` |
| Fastify routes and config | integration | Happy, authorization, state, validation, exact DTO/download and production fail-fast paths | `apps/api/src/*.test.ts` | `corepack pnpm test` |
| Worker/provider | unit + integration | Exact official request/response, retry, terminal failure, storage and ledger branches | `apps/worker/src/*.test.ts` | `corepack pnpm test` |
| React public journey | RTL + Playwright | Loading/error/success, upload/consent, owner/view-only, one regeneration and accessible feedback | `apps/web/src/*.test.tsx`, `apps/web/e2e/*.spec.ts` | `corepack pnpm test && corepack pnpm test:e2e` |
| Build/performance | deterministic build | Entry below 500.000 bytes and operational routes as dynamic chunks | `apps/web/dist`, feature validator | `corepack pnpm build` |
| Operations/legal docs | config + document validation | Commands/links/status labels present; no external validation claim | `.specs/features/p2-readiness/validate.py`, config tests | `python3 .specs/features/p2-readiness/validate.py` |

## Gate Check Commands

> Generated from the repository. Use the Corepack shim when global Corepack cannot download in the sandbox.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Unit-only task | `corepack pnpm test` |
| Full | API, PostgreSQL, worker or UI integration | `corepack pnpm test && corepack pnpm test:e2e` |
| Build | Phase boundary/final | `corepack pnpm check && corepack pnpm test:e2e` |

## Execution Plan

Phases execute sequentially. Eight tightly coupled tasks remain inline in the shared worktree; an independent verifier runs after T8.

### Phase 1: Contract and maintenance foundation

```text
T1 → T2 → T3
```

### Phase 2: Cover vertical slice

```text
T4 → T5 → T6
```

### Phase 3: Operational closure

```text
T7 → T8
```

Cross-phase dependencies:

```text
T3 → T4
T6 → T7
```

## Task Breakdown

### T1: Freeze the P2 contract and validators

**Status**: Complete  
**What**: Record product, privacy, performance, maintenance and external-validation boundaries with deterministic structural validation.  
**Where**: `P2 specification slice`  
**Depends on**: None  
**Reuses**: Existing `.specs` decisions and TLC validators.  
**Requirement**: COVER-01..10, PERF-01..02, MAINT-01..02, OPS-01..03, TEST-01..02

**Tools**:

- MCP: official web documentation
- Skill: `tlc-spec-driven`

**Done when**:

- [x] Spec, context, design and eight tasks exist.
- [x] Every requirement is EARS-shaped and mapped.
- [x] External validation boundary and current official model/cost evidence are explicit.

**Tests**: Deterministic spec/task validators  
**Gate**: Quick

### T2: Adopt the Fastify 6 logging API

**Status**: Pending  
**What**: Replace the deprecated top-level logging option while preserving one sanitized completion event.  
**Where**: `Fastify bootstrap`  
**Depends on**: T1  
**Reuses**: Existing `httpLogContext` and `onResponse` hook.  
**Requirement**: MAINT-01

**Tools**:

- MCP: official Fastify documentation
- Skill: `tlc-spec-driven`

**Done when**:

- [ ] A failing test first proves the intended log contract.
- [ ] `LogController` replaces top-level `disableRequestLogging`.
- [ ] Existing sanitization assertions and API tests pass.

**Tests**: API unit/integration logging assertions  
**Gate**: Quick

### T3: Split the public entry by route

**Status**: Pending  
**What**: Keep the landing in the entry and load every operational public page through dynamic imports.  
**Where**: `public web routing slice`  
**Depends on**: T2  
**Reuses**: Existing `Suspense`, `Loading`, `RouteFocus` and page exports.  
**Requirement**: PERF-01, PERF-02

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`, `frontend-design`

**Done when**:

- [ ] Build assertion fails above 500.000 bytes.
- [ ] Landing no longer imports React Hook Form/Zod page code.
- [ ] Operational routes are dynamic and retain accessible loading/focus behavior.

**Tests**: Build measurement plus focused Playwright routing  
**Gate**: Build

### T4: Persist covers and expose the safe public API

**Status**: Pending  
**What**: Add the historical cover aggregate, validated transient reference upload, attempt creation and capability-only DTO/download routes.  
**Where**: `album-cover API slice`  
**Depends on**: T3  
**Reuses**: Drizzle, generation jobs, `StorageProvider`, signed order/view cookies and delivery token lookup.  
**Requirement**: COVER-01, COVER-02, COVER-03, COVER-05, COVER-07, COVER-09

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [ ] Migration/schema guarantee unique attempts one and two.
- [ ] Validation rejects bad state/access/file/consent before persistence.
- [ ] Concurrent requests create one attempt/job and public responses expose no internal data.
- [ ] Reference bytes are normalized without EXIF in private storage.

**Tests**: Contracts + Fastify/PostgreSQL integration, all route edges  
**Gate**: Full

### T5: Generate covers in the resumable worker

**Status**: Pending  
**What**: Process cover jobs with the official OpenRouter Images API, private storage and complete usage accounting.  
**Where**: `album-cover worker slice`  
**Depends on**: T4  
**Reuses**: Claim/retry queue, local storage safety, `ai_usage` and error sanitization.  
**Requirement**: COVER-04, COVER-06, COVER-07, COVER-08

**Tools**:

- MCP: official OpenRouter/Google documentation
- Skill: `tlc-spec-driven`

**Done when**:

- [ ] Controlled tests prove exact endpoint/body and parse one raster plus usage.
- [ ] Success persists asset/status/ledger exactly once.
- [ ] Retry reuses the attempt; terminal outcomes remove the reference.
- [ ] No paid provider call occurs.

**Tests**: Worker unit and real-PostgreSQL integration  
**Gate**: Full

### T6: Ship the cover UI and public React cleanup

**Status**: Pending  
**What**: Add the accessible cover card to owner/delivery pages and decompose public components flagged by React Doctor.  
**Where**: `public cover experience slice`  
**Depends on**: T5  
**Reuses**: React Query polling, capability downloads, existing card/action tokens and toasts.  
**Requirement**: COVER-10, MAINT-02

**Tools**:

- MCP: NONE
- Skill: `frontend-design`, `react-doctor`, `tlc-spec-driven`

**Done when**:

- [ ] Owner can consent/upload/generate, view/download and regenerate once.
- [ ] View-only delivery can view/download and has no mutation control.
- [ ] UI names AI origin, pending/error state and remaining regeneration.
- [ ] Public Doctor warnings are resolved; dirty admin file is byte-identical to baseline.

**Tests**: RTL + Playwright owner/view-only/state matrix  
**Gate**: Full

### T7: Complete production activation and legal/restore readiness

**Status**: Pending  
**What**: Add persistent private storage selection, fail-fast production config and executable activation/retention/restore runbooks.  
**Where**: `production readiness slice`  
**Depends on**: T6  
**Reuses**: `StorageProvider`, env parsing, production checklist, provider setup and runbook.  
**Requirement**: OPS-01, OPS-02, OPS-03

**Tools**:

- MCP: official provider documentation
- Skill: `tlc-spec-driven`

**Done when**:

- [ ] Production rejects local/implicit storage and missing cover model config.
- [ ] S3-compatible private adapter is covered without remote calls.
- [ ] Sandbox/e-mail/storage/restore runbooks name command, evidence, rollback and `EXTERNAL BLOCKED` state.
- [ ] Legal pages disclose AI/reference lifecycle and remain marked for legal approval.

**Tests**: Config/provider unit tests plus deterministic documentation validation  
**Gate**: Build

### T8: Run complete and independent validation

**Status**: Pending  
**What**: Prove all local behavior, migrations, performance and regression resistance, then record honest external blockers.  
**Where**: `P2 validation evidence`  
**Depends on**: T7  
**Reuses**: Repository gates, React Doctor, TLC verifier and discrimination sensor.  
**Requirement**: TEST-01, TEST-02

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`, `react-doctor`

**Done when**:

- [ ] Format, lint, typecheck, tests, build, migrations and E2E pass.
- [ ] Bundle sizes, test counts and Doctor output are recorded.
- [ ] Independent verifier maps all 19 requirements and scratch mutation fails the relevant test.
- [ ] Validation labels external prerequisites separately from local PASS.

**Tests**: Complete gate and independent evidence review  
**Gate**: Build

## Diagram-Definition Cross-Check

| Diagram edge | Matching dependency | Result |
| --- | --- | --- |
| T1 → T2 | T2 depends on T1 | ✅ |
| T2 → T3 | T3 depends on T2 | ✅ |
| T3 → T4 | T4 depends on T3 | ✅ |
| T4 → T5 | T5 depends on T4 | ✅ |
| T5 → T6 | T6 depends on T5 | ✅ |
| T6 → T7 | T7 depends on T6 | ✅ |
| T7 → T8 | T8 depends on T7 | ✅ |

## Test Co-location Validation

| Task | Layer | Tests included with task | Gate | Result |
| --- | --- | --- | --- | --- |
| T1 | Specification | Structural validators | Quick | ✅ |
| T2 | Fastify bootstrap | Logging unit/integration assertions | Quick | ✅ |
| T3 | Web routing/build | Build measurement + focused Playwright | Build | ✅ |
| T4 | Contracts/database/API | Unit + PostgreSQL/Fastify routes | Full | ✅ |
| T5 | Worker/provider | Unit + PostgreSQL processing | Full | ✅ |
| T6 | React journey | RTL + Playwright state/access matrix | Full | ✅ |
| T7 | Provider/config/docs | Unit + deterministic docs checks | Build | ✅ |
| T8 | Whole system | Full gates + independent discrimination | Build | ✅ |
