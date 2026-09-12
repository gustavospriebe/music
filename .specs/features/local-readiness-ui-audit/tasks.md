# Local Readiness and UI/UX Audit Tasks

> Registro histórico de um recorte anterior. O modelo vigente e a evidência atual estão em [docs/documentation-map.md](../../../docs/documentation-map.md) e [audit-remediation](../audit-remediation/spec.md). Este registro não autoriza publicação nem gasto com providers.

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.**

**Design**: `.specs/features/local-readiness-ui-audit/design.md`
**Status**: Approved

## Test Coverage Matrix

> Generated from `AGENTS.md`, `README.md`, `.github/workflows/ci.yml`, package scripts and existing Vitest/Playwright suites.

| Code Layer             | Required Test Type | Coverage Expectation                                        | Location Pattern                                        | Run Command                                |
| ---------------------- | ------------------ | ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------ |
| Package-manager config | none               | Frozen install and stable lockfile                          | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | `corepack pnpm install --frozen-lockfile`  |
| Existing application   | unit/integration   | Preserve every current suite and assertion                  | `apps/**/*.test.*`, `packages/**/*.test.*`              | `pnpm exec turbo run test --concurrency=1` |
| Browser regression     | e2e                | Preserve all current automated journeys                     | `apps/web/e2e/*.spec.ts`                                | `pnpm test:e2e`                            |
| Runtime smoke          | integration        | Migrations, seed, readiness and nonempty products           | runtime evidence                                        | HTTP and PostgreSQL smoke commands         |
| UI/UX audit            | none               | Current accepted screenshots and findings per numbered step | `docs/ui-ux-audit.md`, `output/product-design/**`       | Browser inspection                         |

## Gate Check Commands

| Gate Level | When to Use                       | Command                                                                                                                                           |
| ---------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quick      | Config/doc task                   | `pnpm exec prettier --check <file> && git diff --check`                                                                                           |
| Full       | Runtime validation                | migrations + seed + `pnpm format:check && pnpm lint && pnpm typecheck && pnpm exec turbo run test --concurrency=1 && pnpm build && pnpm test:e2e` |
| Build      | Package-manager task or phase end | `corepack pnpm install --frozen-lockfile && git diff --check`                                                                                     |

## Execution Plan

### Phase 1: Package manager

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Local evidence and audit

```
T6 → T7 → T8
```

## Task Breakdown

### T1: Pin pnpm 12

**Status**: Done

**What**: Confirm the root package-manager contract at pnpm 12.3.4.
**Where**: `package.json`
**Depends on**: None
**Reuses**: Corepack packageManager field
**Requirement**: LOCAL-01
**Tools**: local source and pnpm audit
**Done when**: the exact pnpm pin is valid and no unrelated dependency changes are introduced.
**Tests**: none
**Gate**: Quick

### T2: Normalize build-script policy

**Status**: Done

**What**: Keep the noninteractive pnpm 12 build-script policy explicit.
**Where**: `pnpm-workspace.yaml`
**Depends on**: T1
**Reuses**: current allowBuilds intent
**Requirement**: LOCAL-03
**Tools**: local pnpm contract
**Done when**: pnpm accepts the policy and install requires no approval prompt.
**Tests**: none
**Gate**: Quick

### T3: Validate canonical lockfile

**Status**: Done

**What**: Validate and, only if pnpm requires it, refresh the official two-document pnpm 12 lockfile.
**Where**: `pnpm-lock.yaml`
**Depends on**: T2
**Reuses**: pnpm 12 environment and project lockfile documents
**Requirement**: LOCAL-01, LOCAL-02, LOCAL-03
**Tools**: Corepack pnpm 12 and temporary worktree
**Done when**: the two documents parse, frozen install passes and a second install leaves the lockfile byte-stable.
**Tests**: none
**Gate**: Build

### T4: Exclude generated lockfile from formatting

**Status**: Done

**What**: Keep Prettier from rewriting pnpm's generated multi-document YAML.
**Where**: `.prettierignore`
**Depends on**: T3
**Reuses**: existing generated-artifact ignore list
**Requirement**: LOCAL-02
**Tools**: Prettier and pnpm 12
**Done when**: `pnpm format:check` accepts the pnpm-authored lockfile without modifying it.
**Tests**: none
**Gate**: Quick

### T5: Align safe local review default

**Status**: Done

**What**: Make the example environment default to manual audio review.
**Where**: `.env.example`
**Depends on**: T4
**Reuses**: runtime safe default and Railway runbook
**Requirement**: LOCAL-06
**Tools**: local source
**Done when**: example config and operational docs agree on `manual`.
**Tests**: none
**Gate**: Quick

### T6: Record full local validation

**Status**: Done

**What**: Prove install, databases, gates, boot, readiness and seed without providers.
**Where**: `.specs/features/local-readiness-ui-audit/local-validation.md`
**Depends on**: T5
**Reuses**: Docker Compose, migrations, seed and existing test suites
**Requirement**: LOCAL-04, LOCAL-05, LOCAL-06, LOCAL-07
**Tools**: local shell, disposable PostgreSQL and Playwright suite
**Done when**: the full gate passes and live smoke evidence is recorded with exact boundaries.
**Tests**: integration/e2e
**Gate**: Full

### T7: Audit public and admin experiences

**Status**: Done

**What**: Produce a combined evidence-based UI/UX and accessibility-risk audit.
**Where**: `docs/ui-ux-audit.md`
**Depends on**: T6
**Reuses**: running local app and current routes
**Requirement**: AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04
**Tools**: Product Design Audit and Browser integrated
**Done when**: every important step has an accepted screenshot or named blocker, health and prioritized findings.
**Tests**: none
**Gate**: Quick

### T8: Update project handoff

**Status**: Done

**What**: Point future sessions to the validated local baseline and UI/UX audit.
**Where**: `.specs/STATE.md`
**Depends on**: T7
**Reuses**: canonical project context
**Requirement**: LOCAL-05, AUDIT-03
**Tools**: TLC validators
**Done when**: handoff separates automated gates, Browser audit, human UAT, redesign and deploy.
**Tests**: none
**Gate**: Build

## Phase Execution Map

```
Phase 1: T1 → T2 → T3 → T4 → T5
Phase 2: T6 → T7 → T8
```

## Diagram-Definition Cross-Check

| Task | Depends On | Diagram Shows          | Status |
| ---- | ---------- | ---------------------- | ------ |
| T1   | None       | start                  | Match  |
| T2   | T1         | T1 → T2                | Match  |
| T3   | T2         | T2 → T3                | Match  |
| T4   | T3         | T3 → T4                | Match  |
| T5   | T4         | T4 → T5                | Match  |
| T6   | T5         | phase boundary T5 → T6 | Match  |
| T7   | T6         | T6 → T7                | Match  |
| T8   | T7         | T7 → T8                | Match  |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says       | Status |
| ---- | --------------------------- | --------------- | --------------- | ------ |
| T1   | config                      | none            | none            | OK     |
| T2   | config                      | none            | none            | OK     |
| T3   | lockfile                    | none            | none            | OK     |
| T4   | formatter config            | none            | none            | OK     |
| T5   | example config              | none            | none            | OK     |
| T6   | runtime evidence            | integration/e2e | integration/e2e | OK     |
| T7   | audit docs                  | none            | none            | OK     |
| T8   | project state               | none            | none            | OK     |
