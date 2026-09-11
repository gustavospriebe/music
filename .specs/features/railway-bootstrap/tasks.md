# Railway Bootstrap Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.**

**Design**: `.specs/features/railway-bootstrap/design.md`
**Status**: Done

## Test Coverage Matrix

> Generated from `AGENTS.md`, `README.md`, `.github/workflows/ci.yml` and existing Vitest/Playwright suites.

| Code Layer           | Required Test Type | Coverage Expectation                                     | Location Pattern                             | Run Command                             |
| -------------------- | ------------------ | -------------------------------------------------------- | -------------------------------------------- | --------------------------------------- |
| CI/config/docs       | none               | Structural checks and clean-checkout gate                | `.github/**`, `docs/**`, `.specs/**`         | `pnpm format:check && git diff --check` |
| Existing application | unit/integration   | Preserve all current suites                              | `apps/**/*.test.ts`, `packages/**/*.test.ts` | `pnpm test`                             |
| Browser flow         | e2e                | Preserve all current specs without provider calls        | `apps/web/e2e/*.spec.ts`                     | `pnpm test:e2e`                         |
| Railway resources    | none               | Read-after-write proves exact names and zero deployments | MCP inventory                                | MCP list/status/deployments             |

## Gate Check Commands

| Gate Level | When to Use                       | Command                                        |
| ---------- | --------------------------------- | ---------------------------------------------- |
| Quick      | Docs/config after each local task | `pnpm format:check && git diff --check`        |
| Full       | Clean checkout validation         | `pnpm check && pnpm test:e2e`                  |
| Build      | External/config task              | structural validator plus MCP read-after-write |

## Execution Plan

### Phase 1: Local contract

```
T1 → T2 → T3 → T4
```

### Phase 2: Railway bootstrap

```
T5 → T6 → T7
```

## Task Breakdown

### T1: Repair CI bootstrap

**What**: Install pnpm before setup-node cache and add format gate.
**Where**: `.github/workflows/ci.yml`
**Depends on**: None
**Reuses**: `package.json` packageManager pin
**Requirement**: BOOT-01, BOOT-02
**Tools**: local source and GitHub read-only evidence
**Done when**: workflow order is correct and clean-checkout gates execute.
**Tests**: none
**Gate**: Full

### T2: Declare the Turbo test environment

**What**: Allow CI test variables through Turbo strict mode.
**Where**: `turbo.json`
**Depends on**: T1
**Reuses**: existing `test` task
**Requirement**: BOOT-02
**Tools**: local Turbo schema and disposable PostgreSQL
**Done when**: database suites receive `DATABASE_URL_TEST` and pass in serial CI execution.
**Tests**: none
**Gate**: Full

### T3: Create canonical project context

**What**: Document current components, flows, topology, gates and constraints.
**Where**: `docs/project-context.md`
**Depends on**: T2
**Reuses**: `README.md`, `ARCHITECTURE.md`, live audit
**Requirement**: BOOT-03, BOOT-04
**Tools**: local source and Railway docs
**Done when**: new sessions have one current entrypoint and stale claims are labeled.
**Tests**: none
**Gate**: Quick

### T4: Reconcile operational runbooks

**What**: Correct Railway migration/seed/storage/review guidance.
**Where**: `docs/railway-setup.md`
**Depends on**: T3
**Reuses**: official Railway Bucket and pre-deploy docs
**Requirement**: BOOT-04, BOOT-07
**Tools**: Railway docs MCP
**Done when**: runtime, seed and bucket limitations match code and docs.
**Tests**: none
**Gate**: Quick

### T5: Create Railway project

**What**: Create private `musica-da-resenha` after duplicate check.
**Where**: `Railway project musica-da-resenha`
**Depends on**: T4
**Reuses**: authenticated workspace
**Requirement**: BOOT-05
**Tools**: Railway MCP
**Done when**: read-after-write returns the exact project once.
**Tests**: none
**Gate**: Build

### T6: Create empty application services

**What**: Create empty `web`, `api` and `worker` services without source/deployment.
**Where**: `Railway project musica-da-resenha services`
**Depends on**: T5
**Reuses**: project production environment
**Requirement**: BOOT-06
**Tools**: Railway MCP
**Done when**: services exist and deployment lists are empty.
**Tests**: none
**Gate**: Build

### T7: Close safe bootstrap boundary

**What**: Verify no app deployment and record blocked Postgres/Bucket next steps.
**Where**: `.specs/STATE.md`
**Depends on**: T6
**Reuses**: MCP inventory and feature validation
**Requirement**: BOOT-07
**Tools**: Railway MCP and TLC validators
**Done when**: handoff distinguishes created, pending, deployment and external gates.
**Tests**: none
**Gate**: Build

## Phase Execution Map

```
Phase 1: T1 → T2 → T3 → T4
Phase 2: T5 → T6 → T7
```

## Diagram-Definition Cross-Check

| Task | Depends On | Diagram Shows          | Status |
| ---- | ---------- | ---------------------- | ------ |
| T1   | None       | start                  | Match  |
| T2   | T1         | T1 → T2                | Match  |
| T3   | T2         | T2 → T3                | Match  |
| T4   | T3         | T3 → T4                | Match  |
| T5   | T4         | phase boundary T4 → T5 | Match  |
| T6   | T5         | T5 → T6                | Match  |
| T7   | T6         | T6 → T7                | Match  |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1   | CI config                   | none            | none      | OK     |
| T2   | Turbo config                | none            | none      | OK     |
| T3   | docs                        | none            | none      | OK     |
| T4   | docs                        | none            | none      | OK     |
| T5   | Railway resource            | none            | none      | OK     |
| T6   | Railway resources           | none            | none      | OK     |
| T7   | project state               | none            | none      | OK     |
