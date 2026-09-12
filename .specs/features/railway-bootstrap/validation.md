# Railway Bootstrap Validation

> Registro histórico de um recorte anterior. O modelo vigente e a evidência atual estão em [docs/documentation-map.md](../../../docs/documentation-map.md) e [audit-remediation](../audit-remediation/spec.md). Este registro não autoriza publicação nem gasto com providers.

**Result**: PASS
**Overall**: PASS
**Date**: 2026-09-06
**Spec**: `.specs/features/railway-bootstrap/spec.md`
**Diff range**: `c9f3d04` + uncommitted `railway-bootstrap` allowlist
**Verifier**: independent sub-agent (author != verifier)

---

## Task Completion

| Task | Status | Evidence                                                                                                                                                  |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | PASS   | `.github/workflows/ci.yml:30` installs pnpm before `setup-node`; lines 35-45 contain the complete gate.                                                   |
| T2   | PASS   | `turbo.json:11` forwards the five CI variables; `.github/workflows/ci.yml:42` serializes the shared-database suites.                                      |
| T3   | PASS   | `docs/project-context.md:1` is the canonical map; `AGENTS.md:3` and `README.md:9` route new sessions to it.                                               |
| T4   | PASS   | `docs/railway-setup.md:19` defines runtime ownership; lines 105-115 separate provisioning, seed, promotion and Bucket limits.                             |
| T5   | PASS   | Railway read-only inventory returned exactly one project named `musica-da-resenha`; the create contract defaults to private and no public surface exists. |
| T6   | PASS   | Railway read-only inventory returned exactly `api`, `web` and `worker`, with no repo/image source, domain, variable or deployment.                        |
| T7   | PASS   | `.specs/STATE.md:52` records the handoff; lines 56-57 keep deploy, Postgres, Bucket and external gates pending.                                           |

**Status**: 7/7 tasks complete; no partial or blocked implementation task.

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome                                                                                                   | Evidence and independent assertion                                                                                                                                                                                                                                                             | Result |
| --------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| BOOT-01   | The declared pnpm is available before `setup-node` enables `cache: pnpm`.                                              | `.github/workflows/ci.yml:30` and `.github/workflows/ci.yml:31`; structural assertion `index(action-setup) < index(setup-node) < index(install)` passed.                                                                                                                                       | PASS   |
| BOOT-02   | After install, CI creates/migrates both databases, then runs format, lint, typecheck, serialized tests, build and E2E. | `.github/workflows/ci.yml:35`; lines 36-45 contain the exact ordered sequence. `turbo.json:11` contains `DATABASE_URL`, `DATABASE_URL_TEST`, `NODE_ENV`, `COOKIE_SECRET` and `CUSTOMER_ACCESS_TOKEN_PEPPER`.                                                                                   | PASS   |
| BOOT-03   | A new session reaches one current map containing components, flows, commands, risks and state sources.                 | `AGENTS.md:3` and `README.md:9` point to `docs/project-context.md:1`; the map covers flow at line 5, boundaries at line 22, topology at line 36, gates at line 42, risks at line 51 and state sources at line 60.                                                                              | PASS   |
| BOOT-04   | Unexecuted external stages remain pending and are not represented as homologation or production.                       | `IMPLEMENTATION_PLAN.md:8` keeps external infrastructure unchecked. `docs/project-context.md:47`, `docs/production-checklist.md:26` and `.specs/STATE.md:56` explicitly separate deploy, UAT, homologation and production.                                                                     | PASS   |
| BOOT-05   | One private Railway project named `musica-da-resenha`, without duplicate.                                              | Railway `list-projects` on 2026-09-06 returned one exact-name match among three accessible projects; the create contract defaults `isPublic` to false, and live domain/deployment reads expose no public surface. `.specs/STATE.md:52` names the feature boundary.                             | PASS   |
| BOOT-06   | Empty `web`, `api` and `worker` services exist without deployment.                                                     | Railway `list-services`, `get-status`, `list-deployments`, `get-service-config` and `list-domains` returned the exact three-name set, `latestDeployment = null`, zero deployments, no source repo/image, no variables and no domains; `.specs/STATE.md:54` records the created empty services. | PASS   |
| BOOT-07   | If Postgres/Bucket creation deploys immediately, stop before creation and record the blocker plus exact next step.     | Railway inventory contains neither data service and zero deployments. `.specs/STATE.md:56-57` records provision only after explicit deploy authority; `docs/railway-setup.md:107` starts the deferred activation sequence.                                                                     | PASS   |

**Status**: 7/7 acceptance criteria match precise spec outcomes; 0 uncovered criteria; 0 spec-precision gaps.

## Edge Cases

- [x] Duplicate project: the live inventory has one exact-name match.
- [x] Unexpected deployment: zero deployments and `latestDeployment = null` for every app service.
- [x] Divergent local worktree: `.specs/STATE.md:56-59` defers source connection until the WIP is resolved and the remote revision is confirmed.
- [x] Secret handling: service config exposed names only and currently returned no variable names; no value was read or recorded.

## Discrimination Sensor

The sensor used a detached temporary worktree at `c9f3d04`, overlaid only the current workflow and Turbo configuration, and ran an independent Node structural assertion. No stash was used.

| Mutation | Target                        | Fault                                                        | Result                                                               |
| -------- | ----------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| 1        | `.github/workflows/ci.yml:30` | Moved `pnpm/action-setup` after `setup-node` cache setup.    | KILLED: `wrong order pnpm/action-setup@v4 -> actions/setup-node@v4`. |
| 2        | `turbo.json:13`               | Removed `DATABASE_URL_TEST` from the Turbo test environment. | KILLED: `missing turbo env DATABASE_URL_TEST`.                       |
| 3        | `.github/workflows/ci.yml:42` | Replaced serialized Turbo tests with `pnpm test`.            | KILLED: required serialized test command missing.                    |

**Sensor depth**: lightweight, 3 targeted configuration mutations.
**Result**: 3/3 killed, 0 survived. After worktree removal, real-tree `git status --porcelain=v1 --untracked-files=all` matched the pre-sensor baseline byte for byte.

## Gate Check

- **Spec validator**: `validate_spec.py .specs/features/railway-bootstrap/spec.md` -> 0 errors, 0 warnings.
- **Task validator**: `validate_tasks.py .specs/features/railway-bootstrap/tasks.md` -> 0 errors; 7 expected warnings because the coverage matrix declares no new tests for config/docs/Railway resources.
- **Targeted format gate**: Prettier checked all feature-owned CI, config, docs and TLC artifacts -> PASS.
- **Whitespace gate**: `git diff --check` -> PASS.
- **Structural build gate**: workflow order, required commands, Turbo environment and Railway read-after-write inventory -> PASS.
- **Clean-checkout full gate evidence**: the orchestrator ran frozen install, migrations against disposable primary/test PostgreSQL databases, format, lint, typecheck, 119 serialized tests, build and 30 Playwright tests -> all PASS. This verifier did not duplicate that full run against the intentionally corrupted local pnpm WIP.
- **Test count before feature**: 119 application tests and 30 Playwright tests.
- **Test count after feature**: 119 application tests and 30 Playwright tests.
- **Delta**: 0; the feature changed no test file and weakened no assertion.
- **Skipped/failures**: none reported by the clean-checkout gate.

## Code and Documentation Quality

| Principle                                      | Status | Evidence                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimum change and no scope creep              | PASS   | The allowlist is limited to CI/Turbo, canonical-context links, operational docs, project state and feature artifacts.                                                                                                                                                            |
| Surgical WIP preservation                      | PASS   | `apps/worker/src/worker.ts`, `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml` were not changed by verification.                                                                                                                                                        |
| Existing patterns and factual code map         | PASS   | `docs/project-context.md:24-34` matches current app/package boundaries; code confirms PostgreSQL queue, private storage adapter, API/worker provider ownership and `assertTransition`.                                                                                           |
| Railway guidance matches primary documentation | PASS   | Official Railway docs confirm pre-deploy commands for migrations, staged variable changes, private S3-compatible Buckets, virtual-hosted URLs for current Buckets, public-network service egress, no automatic backups/versioning/lifecycle/object lock, and encryption at rest. |
| Tests map to scope                             | PASS   | No feature test was added. Existing unit/integration/E2E suites are regression gates; BOOT-01/02 are claimed by the structural assertions above.                                                                                                                                 |
| No shallow or unclaimed feature tests          | PASS   | There are no new feature tests; 3/3 independent configuration mutants were killed.                                                                                                                                                                                               |
| Documented guidelines followed                 | PASS   | `AGENTS.md:3-25` and TLC `coding-principles.md` were applied; no provider call, deploy, commit, push, reset, repository cleanup or stash occurred.                                                                                                                               |

## Requirement Traceability

| Requirement | Previous | Verified result |
| ----------- | -------- | --------------- |
| BOOT-01     | Verified | PASS            |
| BOOT-02     | Verified | PASS            |
| BOOT-03     | Verified | PASS            |
| BOOT-04     | Verified | PASS            |
| BOOT-05     | Verified | PASS            |
| BOOT-06     | Verified | PASS            |
| BOOT-07     | Verified | PASS            |

## Residual Risks and Boundaries

- Remote CI has not run this uncommitted workflow. The clean-checkout local gate proves executability, not GitHub Actions acceptance.
- Railway's read-only project listing does not expose a visibility boolean. The private result is backed by the create-project contract/default and absence of any public domain or deployment, not by a separate live visibility field.
- `production` is only Railway's initial environment name. It has no deployment, domain, variables, database, bucket, homologation or commercial traffic.
- Postgres/Bucket provisioning, secrets, source connection, migration/seed on Railway, provider calls, Browser UAT, restore drill, homologation and production remain separate future gates.
- The pre-existing pnpm manifest/lock/workspace WIP remains unresolved and outside this feature.

## Summary

**Overall**: PASS. The implementation satisfies BOOT-01 through BOOT-07. The Railway bootstrap stopped at the intended safe boundary. No ranked fix gap was found, so no project lesson was recorded.
