# MVP Operável Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

**Design**: `.specs/features/mvp-operavel/design.md`  
**Status**: Approved by the autonomous execution authorization in the brief

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md`, `README.md`, `.github/workflows/ci.yml`, `package.json`, and `docs/mvp-spec-full.md`. Samples: `packages/contracts/src/index.test.ts`, `packages/domain/src/index.test.ts`, `apps/api/src/app.test.ts`, `apps/api/src/flow.test.ts`, `apps/web/src/components.test.tsx`, `apps/web/e2e/mvp-flows.spec.ts`, and `apps/worker/src/flow.test.ts`.

| Code Layer                        | Required Test Type               | Coverage Expectation                                                                                                                | Location Pattern                            | Run Command                                     |
| --------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Contracts and pure domain rules   | unit                             | All branches changed; 1:1 assertions for applicable ACs and listed validation/status edges                                          | `packages/{contracts,domain}/src/*.test.ts` | `corepack pnpm test`                            |
| PostgreSQL schema and data access | integration                      | Unique/conditional query paths, retry behavior, history preservation, and error paths on real PostgreSQL                            | `apps/{api,worker}/src/*flow.test.ts`       | `corepack pnpm test`                            |
| Fastify public routes             | integration via `fastify.inject` | Every changed route: happy path, every specified edge, authorization failure, concurrency/retry, and exact public payload           | `apps/api/src/*.test.ts`                    | `corepack pnpm test`                            |
| React components and client state | unit with RTL                    | Every changed state derivation and accessible interaction, including unknown/loading/error/empty/success                            | `apps/web/src/*.test.tsx`                   | `corepack pnpm test`                            |
| Public customer journey           | Playwright e2e                   | Happy path plus reload, failure, keyboard, focus/scroll, mobile 390 px, exact price and all known/unknown statuses                  | `apps/web/e2e/*.spec.ts`                    | `corepack pnpm test:e2e`                        |
| Config, styles and documentation  | build/UAT                        | Type/build validity, responsive visual comparison, no overflow, reduced motion, documented operational commands and provider claims | config/CSS/docs plus audit captures         | `corepack pnpm check && corepack pnpm test:e2e` |

## Gate Check Commands

> Generated from codebase - confirmed by the autonomous execution authorization. PostgreSQL must be healthy and migrations applied before integration gates.

| Gate Level | When to Use                                        | Command                                         |
| ---------- | -------------------------------------------------- | ----------------------------------------------- |
| Quick      | After tasks with unit tests only                   | `corepack pnpm test`                            |
| Full       | After tasks with integration or E2E coverage       | `corepack pnpm test && corepack pnpm test:e2e`  |
| Build      | At each phase boundary and final operational proof | `corepack pnpm check && corepack pnpm test:e2e` |

## Execution Plan

Phases are ordered and run sequentially. The feature contains eight tasks, so it fits one inline batch under the delegation rule; the independent Verifier still runs after T8.

### Phase 1: Trustworthy public state

Contracts, persistence, authorization, idempotency and append-only lyrics.

```text
T1 → T2 → T3 → T4
```

### Phase 2: Observable customer journey

Durable client submission, closed status rendering and accessible visual flow.

```text
T5 → T6 → T7
```

### Phase 3: Operational handoff

Documentation, researched cover-image backlog and complete local proof.

```text
T8
```

## Task Breakdown

### Phase 1: Trustworthy public state

### T1: Close the public contract surface

**Status**: Complete  
**What**: Define exact creation, catalog, checkout and order-status contracts so internal identifiers and unknown states cannot pass as valid public data.  
**Where**: `public contract consumers`  
**Depends on**: None  
**Reuses**: Existing Zod schemas, `productTypeSchema`, UUID validation and inferred TypeScript types.  
**Requirement**: FLOW-01, PAY-01, ASYNC-05, ASYNC-06, SAFE-01, SAFE-02, SAFE-03

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] Creation requires a UUID attempt key while preserving the existing product vocabulary.
- [x] Product and checkout response schemas enumerate only the allowed public keys.
- [x] Order status is a closed union and malformed or absent values fail parsing.
- [x] Unit tests assert exact parsed keys and rejection of leaked/unknown fields or states.

**Tests**: unit, co-located in the contracts package and mapped to every listed criterion  
**Gate**: Quick

### T2: Make order creation retry-safe in PostgreSQL

**Status**: Complete  
**What**: Persist a hashed creation key and make repeated order creation return the same public order without duplicating events or secrets.  
**Where**: `orders persistence slice`  
**Depends on**: T1  
**Reuses**: Drizzle migrations, `hashToken`-style SHA-256 hashing, seeded products and existing create-order handler.  
**Requirement**: FLOW-01, FLOW-05, SAFE-03

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] Migration `0004` adds a nullable unique hash column without changing existing rows.
- [x] Two sequential or concurrent creates with one attempt key return one `publicId` and one creation event.
- [x] The raw attempt key never reaches the database, response or logs.
- [x] A retry receives a valid order session for the reused order; T3 upgrades its marker to a signed capability.

**Tests**: PostgreSQL integration through `fastify.inject`, including sequential, concurrent and payload inspection  
**Gate**: Full

### T3: Enforce signed access and identifier-free payment

**Status**: Complete  
**What**: Require server-signed order/view capabilities, project public product DTOs, and confirm local payment by public order under authorization.  
**Where**: `Fastify public boundary`  
**Depends on**: T2  
**Reuses**: `@fastify/cookie`, current cookie names/flags, payment idempotency key and audio job uniqueness.  
**Requirement**: PAY-02, PAY-03, PAY-04, SAFE-01, SAFE-02, SAFE-03, SAFE-07

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] Literal forged order and view cookies return 401; server-issued signed cookies work.
- [x] `/products` returns exactly `type`, `name`, `priceCents`, `active`.
- [x] Checkout omits payment UUID and reuses one pending preference.
- [x] Dev confirmation uses `publicId`, requires full signed access and creates one audio job across retries.
- [x] Route tests prove no unauthorized state, payment or queue mutation.

**Tests**: Fastify/PostgreSQL integration for every changed public route, happy/error/forgery/retry paths and exact payload keys  
**Gate**: Full

### T4: Claim lyrics once and append approval history

**Status**: Complete  
**What**: Give lyric generation one atomic, expiring claim and make edits/approval append versions without mutating historical rows.  
**Where**: `lyrics lifecycle slice`  
**Depends on**: T3  
**Reuses**: `assertTransition`, `validateLyrics`, provider usage ledger and unique order/version index.  
**Requirement**: GEN-01, GEN-04, GEN-06, LYRIC-01, LYRIC-02, SAFE-05

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] Concurrent generation executes one provider call and the loser receives 409.
- [x] A fresh `lyrics_generating` claim cannot restart; one older than five minutes can be reclaimed once.
- [x] Provider errors are sanitized/capped and the order reaches the explicit retryable failure state through `assertTransition`.
- [x] Save appends the next version and approval always appends an approved copy of the exact visible content.
- [x] Integration assertions compare every old/new version, number, kind and approval marker.

**Tests**: Fastify/PostgreSQL integration for concurrency, stale claim, provider failure, edited and unchanged approval, ordering and immutability  
**Gate**: Build

### Phase 2: Observable customer journey

### T5: Preserve the submission attempt and server price

**Status**: Complete  
**What**: Make the client retain drafts and one creation attempt through partial failure while sourcing price and dev confirmation only from public contracts.  
**Where**: `web data-entry slice`  
**Depends on**: T4  
**Reuses**: React Hook Form, React Query, guarded storage helpers, current API client and money formatter.  
**Requirement**: FLOW-01, FLOW-02, FLOW-03, FLOW-04, FLOW-05, PAY-01, PAY-03, PAY-05

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`, `frontend-design`

**Done when**:

- [x] Draft restore/save is exception-safe and announced in `role="status"`.
- [x] Invalid controls receive focus, `aria-invalid`, a stable description and the two-memory rule.
- [x] One UUID attempt survives create/story-save failure and clears only after the story is saved.
- [x] Landing and checkout show the same API price or no numeric price when catalog fails.
- [x] Dev checkout confirms by public order and announces “Confirmando pagamento”.

**Tests**: RTL unit plus Playwright coverage for restore, validation, partial retry, catalog failure, exact price and pending confirmation  
**Gate**: Full

### T6: Render a closed, resumable production journey

**Status**: Complete
**What**: Derive generation, review, production, failure, empty and delivery screens only from validated states with polling instead of duplicate mutations.  
**Where**: `web status journey slice`  
**Depends on**: T5  
**Reuses**: React Query polling, existing local order history, audio players, delivery exchange and page error patterns.  
**Requirement**: GEN-02, GEN-03, GEN-05, GEN-06, LYRIC-03, LYRIC-04, ASYNC-01, ASYNC-02, ASYNC-03, ASYNC-04, ASYNC-05, ASYNC-06, ASYNC-07

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`, `frontend-design`

**Done when**:

- [x] `lyrics_generating` loads and reloads as live polling without POSTing again.
- [x] Lyric failure has a real retry; save/approve errors preserve text and busy states name/disable both actions.
- [x] A five-step production rail maps every known status and marks delivery complete only with two variants.
- [x] Paid audio failure is honest and status-unknown/absent renders an inconsistency with no mutation CTA.
- [x] Delivery recovery records local history and empty history offers creation.

**Tests**: RTL and Playwright state matrix covering every known group, absent/unknown status, reload, error, retry, busy, partial audio and delivery recovery  
**Gate**: Full

### T7: Finish accessible navigation and responsive visual hierarchy

**Status**: Complete
**What**: Apply the approved studio identity, route focus behavior and keyboard-safe mobile navigation across the public journey.  
**Where**: `web presentation system`  
**Depends on**: T6  
**Reuses**: Current peach/orange/ink tokens, lucide-react icons, existing Header/Footer/layout classes and baseline screenshots.  
**Requirement**: A11Y-01, A11Y-02, A11Y-03, A11Y-04, A11Y-05, A11Y-06, A11Y-07, TEST-01, TEST-03

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`, `frontend-design`, `product-design:audit`

**Done when**:

- [x] Path changes scroll to zero and focus one `main` with `tabIndex=-1`.
- [x] Menu exposes expanded/name state, closes on Escape, restores focus and locks page scroll while open.
- [x] Headings preserve word spacing; focus rings pass 3:1; primary targets are at least 44 px.
- [x] The five-step rail is the single visual signature and all decorative motion stops under reduced-motion.
- [x] Desktop and 390 × 844 captures show no horizontal overflow, clipped headings or hidden primary action.

**Tests**: RTL interaction plus Playwright keyboard/scroll/mobile/reduced-motion assertions and final screenshot capture  
**Gate**: Build

### Phase 3: Operational handoff

### T8: Prove and document the operable MVP

**What**: Update operator/product documentation, record the researched album-cover extension, and run the complete local UAT and quality gates.  
**Where**: `MVP operational evidence`  
**Depends on**: T7  
**Reuses**: README/runbooks, baseline audit states, Docker PostgreSQL, migration/seed scripts and official provider documentation.  
**Requirement**: SAFE-04, SAFE-06, TEST-01, TEST-02, TEST-03, TEST-04

**Tools**:

- MCP: official web documentation already researched; no provider call
- Skill: `tlc-spec-driven`, `react-doctor`, `product-design:audit`

**Done when**:

- [ ] README/docs describe actual fallbacks, signed recovery, idempotency, operational retry and no fake-provider claim.
- [ ] Album-cover backlog specifies model/cost, consent/privacy, storage, one included render and one bounded regeneration without calling a paid provider.
- [ ] Migration and seed succeed twice where idempotency applies; API/web/worker serve and the real-browser happy/failure/mobile UAT passes.
- [ ] Format, lint, typecheck, all tests, build, E2E and React Doctor exit 0 with counts recorded.
- [ ] Before/after audit evidence and ranked backlog close every P0/P1 or name a concrete blocker.

**Tests**: Complete operational gate, migration/seed replay, Playwright UAT, React Doctor and documentation/link review  
**Gate**: Build

## Diagram-Definition Cross-Check

| Diagram edge        | Matching dependency | Result                             |
| ------------------- | ------------------- | ---------------------------------- |
| T1 → T2             | T2 depends on T1    | ✅                                 |
| T2 → T3             | T3 depends on T2    | ✅                                 |
| T3 → T4             | T4 depends on T3    | ✅                                 |
| T5 → T6             | T6 depends on T5    | ✅                                 |
| T6 → T7             | T7 depends on T6    | ✅                                 |
| Cross-phase T4 → T5 | T5 depends on T4    | ✅ backward cross-phase dependency |
| Cross-phase T7 → T8 | T8 depends on T7    | ✅ backward cross-phase dependency |

## Test Co-location Validation

| Task | Layer from matrix      | Tests included with task                                                | Gate  | Result |
| ---- | ---------------------- | ----------------------------------------------------------------------- | ----- | ------ |
| T1   | Contracts              | Unit assertions for exact public schemas and state rejection            | Quick | ✅     |
| T2   | PostgreSQL + route     | Integration assertions for hash uniqueness, retry and event count       | Full  | ✅     |
| T3   | Public routes          | Integration assertions for access, exact DTOs, payment/job idempotency  | Full  | ✅     |
| T4   | PostgreSQL + route     | Integration assertions for concurrency, recovery and immutable versions | Build | ✅     |
| T5   | React + journey        | RTL/Playwright for draft, retry, validation, price and checkout         | Full  | ✅     |
| T6   | React + journey        | RTL/Playwright status and recovery matrix                               | Full  | ✅     |
| T7   | Presentation + journey | RTL/Playwright keyboard, focus, responsive and screenshot checks        | Build | ✅     |
| T8   | Operations/config/docs | Full gates, DB replay, UAT, React Doctor and link review                | Build | ✅     |
