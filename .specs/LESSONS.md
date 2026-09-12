# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - Assert every enumerated validation field has its own accessible error association

- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web-forms` · harmful: 0
- features: mvp-operavel
- evidence: FLOW-02 (web-forms)
- last seen: 2026-09-04T22:59:03Z

### L-002 - Assert user-visible success feedback for every successful write mutation

- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web-mutations` · harmful: 0
- features: mvp-operavel
- evidence: LYRIC-01 (web-mutations)
- last seen: 2026-09-04T22:59:03Z

### L-003 - Assert polling repeats in active states and stops in terminal states

- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web-async` · harmful: 0
- features: mvp-operavel
- evidence: ASYNC-01 (web-async)
- last seen: 2026-09-04T22:59:04Z

### L-004 - Assert the exact count of rendered media and download controls at delivery

- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web-delivery` · harmful: 0
- features: mvp-operavel
- evidence: ASYNC-02 (web-delivery)
- last seen: 2026-09-04T22:59:04Z

### L-005 - Assert recovery flows persist the public reference in browser storage

- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web-recovery` · harmful: 0
- features: mvp-operavel
- evidence: ASYNC-04 (web-recovery)
- last seen: 2026-09-04T22:59:04Z

### L-006 - Measure computed focus-indicator contrast instead of inferring it from CSS source

- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web-a11y` · harmful: 0
- features: mvp-operavel
- evidence: A11Y-02 (web-a11y)
- last seen: 2026-09-04T22:59:04Z

### L-007 - Test heading count and typography across the complete public route matrix

- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web-a11y` · harmful: 0
- features: mvp-operavel
- evidence: A11Y-05 (web-a11y)
- last seen: 2026-09-04T22:59:04Z

### L-008 - Assert exact response keys for every public DTO including delivery

- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api-boundary` · harmful: 0
- features: mvp-operavel
- evidence: SAFE-03 (api-boundary)
- last seen: 2026-09-04T22:59:04Z

### L-009 - Capture and assert the exact structured log keys at every public process boundary

- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `observability` · harmful: 0
- features: mvp-operavel
- evidence: SAFE-04 (observability)
- last seen: 2026-09-04T22:59:04Z

### L-010 - Serialize suites that claim the global PostgreSQL queue and clear fixtures only inside an explicitly isolated local test database.

- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `postgres-tests` · harmful: 0
- features: audit-remediation
- evidence: VERIFY-01: .specs/features/audit-remediation/validation.md (postgres-tests)
- last seen: 2026-09-12T04:55:05Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
