# TESTING — 2026 research and CabDesk quality system

Status: research complete 2026-10-19. No test-system code has been changed yet.
Scope: CabDesk backend (FastAPI/Postgres/Redis), frontend (Next.js 15/React 19), Docker edge, and the release process.

## 0. Verdict

"100% bug-free" is not provable by any test suite. What is provable is narrower and more useful:

1. every critical business rule has an executable assertion;
2. every cross-tenant access path is denied by test;
3. every release passes the same gates that caught the last regression;
4. every escaped defect becomes a permanent regression test.

CabDesk is not a rendering-heavy product. Its real risk is **tenant isolation, authorization, state transitions, expiry/date math, report/export correctness, and regressions in shared UI controls**. The evidence therefore supports a pragmatic trophy, not a dogmatic pyramid:

- strong static layer (TypeScript, lint, OpenAPI schema);
- broad integration/contract layer (pytest + testcontainers + Schemathesis);
- targeted component tests for pure frontend logic;
- a thin, ruthless E2E layer (Playwright) covering only user journeys that cross the browser/API boundary;
- mutation testing to prove assertions actually bite;
- security, accessibility, visual, and performance checks as release gates, not afterthoughts.

The existing backend base is stronger than typical for this stage: **22 tests pass** (verified 2026-10-19), including RLS and cross-tenant isolation. The gaps are equally clear: **zero frontend tests, zero CI, zero coverage/contract/mutation tooling, rate limiting untested, and the entire P0 surface (search, activity, attention, exports, reports) untested**.

## 1. What the 2026 evidence says

### 1.1 Suite shape: pyramid, trophy, or risk-weighted

- The classic guidance still appears in CI/CD practice: roughly 60% unit, 30% integration, 10% E2E, with coverage >=80%, zero open High+ defects, flake rate <1%, and security scanning on every commit or nightly (QAPractices, 2026).
- The trophy critique is also current: integration tests should be the widest layer, static analysis the base, and E2E reserved for critical journeys (Medium, "The Test Pyramid Is Outdated — Here's What Replaced It").
- A 2026 counterpoint argues the pyramid remains necessary because integration/E2E suites become slow and flaky without a unit foundation (onpathtesting.com, "The Test Pyramid in 2026: Still Relevant, Still Necessary").

**Resolution for CabDesk:** the shape should follow risk, not fashion. Backend business logic and authorization are cheap to test at the API/DB layer, so that layer should dominate. Browser tests should cover only flows where the browser adds risk: auth/session, palette search/deep links, form submission, downloads, filters, and responsive rendering.

Target mix (not a gate on file counts, a planning budget):

| Layer | Share | Examples |
|---|---:|---|
| Static | base | `tsc --noEmit`, ESLint, Ruff, OpenAPI validation |
| Backend unit/property | ~25% | expiry math, CSV sanitizer, report totals, JWT helpers |
| Backend integration/contract | ~50% | every route, role matrix, tenant isolation, RLS, DB constraints |
| Frontend component | ~10% | `compliance.ts`, `api.ts`, session helpers, small UI states |
| E2E | ~15% | login, dashboard, booking lifecycle, palette, exports, activity |

### 1.2 Multi-tenant isolation is the defining correctness property

The OWASP Multi-Tenant Security Cheat Sheet names the failure classes directly: cross-tenant data leakage, tenant impersonation, broken isolation, IDOR/BOLA, noisy-neighbor effects, cross-tenant privilege escalation, and tenant-context injection. Its verification guidance is concrete:

- derive a table inventory from the schema and classify every table as tenant-scoped, shared, or isolated;
- maintain an authorization matrix and test every resource/role combination;
- test connection reuse: a pooled connection must not retain the previous tenant's context;
- the application DB role must not be a superuser and must not own RLS-bypassing rights;
- set tenant context per transaction (`SET LOCAL`), not per session.

API security guidance converges on the same test: create two ordinary accounts, have A create a resource, then attempt to read/modify it as B; the API must return 403 or 404, never the object. BOLA/IDOR is the #1 API risk and scanners cannot derive valid object IDs, so this must be an explicit test pattern, not a scanner hope (OWASP DevSecOps Guideline; OWASP API Security Testing Framework).

Implementation guidance from practitioners points the same way: enforce tenant filtering at the data-access layer, not in routers or middleware alone (BugStrix); log denial events with actor, requested tenant, memberships, endpoint, and reason, but never the forbidden object's contents (QASkills.sh). Autonoma's multi-tenant testing guides enumerate the places the boundary is forgotten: read paths/IDOR, a missing `tenant_id` predicate in the query layer, background jobs that lose tenant context, and cache entries shared across tenants; their data-isolation work also covers tenant-scoped fixtures.

**CabDesk relevance:** the current `tests/test_isolation.py` already covers cross-tenant reads, mutations, forged JWT claims, and RLS fail-closed behavior. That is the right instinct, but it covers a subset of resources. Search, activity, dashboard attention, reports, and CSV exports aggregate across tables and are exactly where an accidental unscoped query would leak. These need explicit two-tenant tests, including exports.

### 1.3 Assertion strength beats coverage percentage

- Coverage measures execution, not verification. Mutation testing measures whether the suite detects deliberate defects; higher-order mutation work established the technique and its limits (Jia & Harman, "Higher Order Mutation Testing", DOI 10.1016/j.infsof.2009.04.016).
- The REST API testing benchmark "Automated test generation for REST APIs: no time to rest yet" (Kim, Qi, Sinha, Orso; DOI 10.1145/3533767.3534401) evaluated 10 state-of-the-art tools against 20 real-world services and found meaningful differences in coverage and unique failures. Tool choice matters, but no generator replaces domain assertions.
- Schemathesis generates cases from OpenAPI and is explicitly recommended in OWASP's API security guidance as a CI gate. Its Python integration can test an ASGI app in-process (`schemathesis.openapi.from_asgi(path, app)`), which fits the existing pytest harness.
- The practical rule: use coverage as a **ratchet** (never decrease) and mutation score as the **quality signal** on core modules (tenancy, auth, bookings, entitlements, reports, CSV).

### 1.4 Flakiness is an architecture problem

Playwright's first-party guidance is unambiguous: tests should be as isolated as possible, each with its own storage, session, cookies, and data; use `beforeEach` for per-test state; use a setup project for shared authentication state; do not test third-party dependencies. BrowserStack's 2026 guidance attributes roughly half of flaky failures to fragile selectors and most of the rest to shared state; retries should be a diagnostic and quarantine mechanism, never a substitute for a fix. Playwright's retry and trace tooling exists to make flakes visible, not to hide them.

**CabDesk relevance:** the palette's debounce, the URL/event search synchronization, and the demo seed data are all sources of shared-state coupling if tests reuse the demo tenant. E2E must create its own tenant/data per run and wait on web-first assertions, never `sleep`.

### 1.5 AI-generated tests are an accelerant, not an oracle

- A 2025/2026 interview study with 15 practitioners found LLM-generated tests are often syntactically correct but semantically misaligned and can contain hallucinated assertions; human oversight and validation remain necessary (arXiv 2510.17164, "Software Testing with Large Language Models: An Interview Study with Practitioners").
- The 2026 Stack Overflow survey reports 58.1% of respondents use AI for testing, while 53% inspect tests and security outputs; one study reports only 8–17% of generated tests were fault-enforcing.

**Policy:** AI may draft tests, but every merged test must be reviewed for the oracle (what exactly is asserted), must fail when the behavior is deliberately broken, and must pass mutation checks where applicable. No bulk-generated test dumps.

### 1.6 CI: fast feedback, layered gates

GitHub's "effective CI" guidance recommends: isolated, deterministic, fast tests; flaky tests tracked and prioritized; cheap checks gate expensive jobs; independent jobs in parallel; dependency caching; path filters and concurrency cancellation; least-privilege tokens; actions pinned to SHAs; OIDC instead of long-lived cloud secrets; matrix builds; reusable workflows; affected-only testing in monorepos; and CI metrics (duration, flake rate, queue time).

**CabDesk relevance:** one Docker Compose stack plus testcontainers is enough to run the whole matrix locally. CI should not run E2E before typecheck, lint, and backend integration pass.

### 1.7 Security, accessibility, and performance are part of correctness

- **DAST:** OWASP's DevSecOps Guideline recommends an authenticated, API-aware ZAP baseline per PR against an ephemeral/staging environment; a full active scan and an OpenAPI-driven API scan on a schedule or release gate; a rules file to baseline accepted findings; and never active scanning against production. ZAP's GitHub Actions exist for baseline, full, and API scans; pin versions to a commit SHA at adoption. One 2025 source reports an ASVS-level option in newer ZAP releases; verify against the installed version rather than assuming it.
- **ASVS:** map requirements to backlog items by ASVS ID (e.g. `V2.1.1`), not to a generic "security" epic. For CabDesk, Level 2 is the realistic target for a B2B SaaS handling tenant data.
- **Accessibility:** Playwright + `@axe-core/playwright` can automate WCAG A/AA tag checks (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`), but automated rules cover only part of WCAG; keyboard and screen-reader checks remain manual (Playwright accessibility docs).
- **Performance:** k6 expresses SLOs as code via Checks and Thresholds, models load with VUs or arrival-rate executors, includes realistic sleep time, and should progress from isolated components to end-to-end workflows (Grafana k6 API load testing guide). A smoke test belongs in the PR/nightly path; a fuller load test belongs on a schedule.

## 2. Current state audit (verified in this repo, 2026-10-19)

### 2.1 Backend

- Test command: `make test` -> `backend/.venv/bin/pytest -q`.
- Result: **22 passed** (auth 6, bookings 4, entitlements 5, isolation 7).
- Harness: `backend/tests/conftest.py` starts `postgres:18-alpine` via testcontainers, runs Alembic to head, and drives the app in-process with `httpx.ASGITransport`.
- Covered: signup/login/refresh rotation/logout; booking create/assign/complete/cancel and invalid transitions; viewer cannot write; cab/user quotas; reports feature flag; custom-domain entitlement; settings update/public branding; tenant-scoped lists; cross-tenant read/mutation; forged JWT tenant crossing; RLS fail-closed/cross-tenant insert.
- Tooling present: pytest, pytest-asyncio, httpx, testcontainers.
- Tooling absent: coverage, Hypothesis, Schemathesis, mutation testing, Redis/rate-limit fixture, xdist.

### 2.2 Frontend

- 35 source files, 11 pages. No test files, no Playwright/Vitest config, no ESLint config.
- Only `npm run typecheck` (`tsc --noEmit`) exists.
- Tokens and user/tenant data are stored in `localStorage` (`frontend/src/lib/session.ts`). This is an architectural XSS exposure worth a separate security decision; the test plan should at minimum verify session expiry/refresh/logout behavior and that 401 clears state.

### 2.3 CI / delivery

- There is **no `.git` repository and no `.github/workflows`** in `cab-booking-saas`.
- CI cannot run until the project is hosted. Until then, the same gates should be encoded in a `make verify` target so they are runnable locally and become CI steps unchanged.
- Docker Compose has no test profile and no isolated project/ports; tests currently use testcontainers, E2E would need its own stack.

### 2.4 Known untested surface

Every route below exists and has no direct test named after it:

- `POST /auth/login`: rate limiting is disabled in tests (`RATE_LIMIT_ENABLED=false`), so the Redis-backed limiter is entirely unverified.
- `GET /users`, `POST /users`, `PATCH /users/{id}`: role hierarchy, tenant scope, last-owner protection, password handling.
- `GET/PATCH /settings`: authorization, entitlement gates, branding propagation.
- `GET /public/branding`: unknown slug, no-auth leakage.
- `GET /cabs`, `POST/PATCH/DELETE /cabs`: CRUD beyond booking setup, delete constraints, role matrix.
- `GET /drivers`, `POST/PATCH/DELETE /drivers`: same, plus expiry fields.
- `GET /customers`, `POST/PATCH/DELETE /customers`: same.
- `GET /bookings/export.csv`: filter parity, injection guard, BOM, 5000-row cap, filename.
- `GET /reports/summary`, `GET /reports/export.csv`: date-range boundaries, revenue math, role gate, tenant scope.
- `GET /search`: min-2-char rule, 5-per-group cap, cross-tenant leakage, badge text.
- `GET /activity`: pagination bounds, entity filter, ordering, tenant scope.
- `GET /dashboard/attention`: count/date boundaries, deep-link data, 30-day horizon.
- `GET /livez`, `GET /readyz`: readyz 503 when DB is down.
- Cross-cutting: 401/403/404 consistency, 422 shapes, CORS, security headers, OpenAPI drift, audit-write failure rollback.

## 3. Target test system

### 3.1 Stack

| Layer | Tool | Purpose |
|---|---|---|
| Backend unit/property | pytest + Hypothesis | expiry math, CSV sanitizer, report totals, invariants |
| Backend integration | pytest + httpx ASGI + testcontainers Postgres | every route against real Postgres/RLS |
| Contract | Schemathesis (CLI against ephemeral stack; ASGI in-process for fast runs) | OpenAPI conformance, negative/boundary inputs, no 500s |
| Coverage | pytest-cov / coverage.py | ratchet and trend, branch coverage |
| Mutation | mutmut or cosmic-ray (choose after a compatibility spike on Python 3.12) | assertion strength on core modules |
| Frontend unit | Vitest + React Testing Library + jsdom | pure logic and small components only |
| E2E | Playwright + @playwright/test | critical journeys, auth, downloads, filters |
| Accessibility | @axe-core/playwright + manual checklist | WCAG 2.2 A/AA on key pages |
| Visual | Playwright `toHaveScreenshot` | a few stable pages, fixed OS/browser |
| Performance | k6 | smoke + load with thresholds as SLOs |
| Security | ZAP baseline/full/API scans, pip-audit, npm audit, Dependabot | DAST + dependency gates |
| CI | GitHub Actions (once hosted) + `make verify` locally | layered gates, artifacts, metrics |

Install versions only after a compatibility check against Python 3.12, Node 22, Next 15.5, and React 19. Pin CI actions to SHAs.

### 3.2 Environments and data

- **Integration tests:** one testcontainers Postgres per session; per-test tenants via `signup_tenant` (already the pattern). Do not use the demo tenant for assertions.
- **E2E:** dedicated `docker-compose.test.yml` with an isolated Compose project name, its own DB volume, and non-conflicting ports. Seed through the API, not through UI clicks. One tenant per worker; unique emails/slugs; teardown on failure (`if: always()`).
- **Demo seed:** reserved for manual demos and visual baselines. Never mutate it from tests.
- **Time:** use `time-machine` (or freezegun) to freeze "now" for expiry and report-date tests. Test boundaries: yesterday, today, +1d, +6/+7d, +14d, +30d, +31d, month-end, leap day.
- **Rate limiting:** add a Redis testcontainer (`redis:8-alpine`) and a fixture that enables `RATE_LIMIT_ENABLED=true`; assert 429 after the configured threshold and independent buckets per IP/tenant.

## 4. Test architecture for CabDesk

### 4.1 Multi-tenant authorization matrix

Roles in the model: `owner`, `admin`, `manager`, `driver`, `viewer`.

Actions by role (from the live route dependencies):

| Resource / action | owner | admin | manager | driver | viewer |
|---|---|---|---|---|---|
| Read cabs/drivers/customers/bookings | yes | yes | yes | yes | yes |
| Create/update cabs/drivers/customers | yes | yes | yes | no | no |
| Delete cabs/drivers/customers | yes | yes | no | no | no |
| Create/assign/complete/cancel bookings | yes | yes | yes | no | no |
| Users list/create/update | yes | yes | no | no | no |
| Settings read/update | yes | yes | no | no | no |
| Reports summary/export | yes | yes | yes | no | no |

Test pattern for every resource:

1. Tenant A and tenant B each create a resource of the same type.
2. A reads B's ID: expect 404 (current convention) and no body leakage.
3. A patches/deletes B's ID: expect 404/403, and B's row is unchanged.
4. A lists with filters that match B's data: B's rows never appear.
5. A exports/searches with terms matching B's data: B's rows never appear.
6. A forges a JWT with B's `tenant_id` but A's user id/signature: expect 401/403.
7. Repeat for each role, especially `viewer` and `driver`.
8. Verify denial logging contains no forbidden object contents.

### 4.2 Endpoint test matrix (new coverage)

**Auth**
- signup: duplicate slug/email, weak/invalid payload, slug normalization, tenant bootstrap roles.
- login: wrong password, unknown tenant, tenant-scoped email collision, rate limit 429, timing-safe password check (behavioral).
- refresh: rotation, reuse detection (already covered), expired/malformed token.
- logout: revoke, idempotency, access token still valid until expiry (document expected behavior).
- `/me`: tenant/user shape, 401 after logout if revoked.
- JWT: `alg=none`, wrong key, tampered tenant claim, expired `exp`, clock skew.

**Bookings**
- create validation: missing fields, invalid dates, end before start, past dates, unknown cab/driver/customer IDs from another tenant.
- lifecycle: assign -> complete; cancel from each state; double assign; concurrent assign (two requests, one wins); resource release on cancel/complete.
- filters/pagination: status, q, date range, page bounds, page_size cap.
- export: exact row parity with list filters, injection guard, BOM, filename, empty result, 5000 cap, cross-tenant absence.

**Fleet/customers/users/settings**
- CRUD, unique constraints (license plate, email), delete with active bookings (expect documented behavior), role matrix.
- users: owner/admin creation, role changes, cannot cross tenant, cannot demote/delete last owner if that rule exists (verify implementation).
- settings: patch branding, public endpoint reflects it, custom-domain entitlement gate, tenant isolation.
- public branding: unknown slug 404, no auth required, no private fields.

**P0 read surfaces**
- search: 1-char rejection/empty, 2-char minimum, per-group 5 cap, case/trim, badge mapping, cross-tenant absence.
- activity: page 1, page size bounds, entity filter, ordering desc, tenant absence, invalid entity 422.
- attention: unassigned/overdue counts, 30-day expiry horizon, boundary dates included/excluded, deep-link href data, tenant absence.
- reports: range inclusivity, zero-data ranges, revenue math vs DB truth, cancelled-booking treatment, role gate, export parity.

**Cross-cutting**
- `readyz` returns 503 when DB is unavailable (monkeypatch session).
- Audit failure rolls back the business write and returns an error (regression for the `jsonable_encoder` bug).
- CORS: allowed origin echoes; disallowed origin does not.
- OpenAPI: schema validates; Schemathesis finds no 500s on valid/invalid inputs.
- Migration: `alembic upgrade head` on an empty DB and on a DB at the previous revision.

### 4.3 Property-based tests (Hypothesis)

- `csv_export._sanitize`: for any string, output never begins with `= + - @ \t \r`; prefixes exactly one quote; preserves ordinary text.
- Expiry classification: for any `(expiry, now)`, badge text/tone matches the documented thresholds and is stable at boundaries.
- Report totals: for any generated set of bookings in a range, exported totals equal the sum of included rows; excluding cancelled rows matches the service rule.
- Search: result count per group never exceeds 5; every hit belongs to the current tenant.

### 4.4 Frontend component tests (Vitest)

- `lib/compliance.ts`: threshold boundaries and badge strings.
- `lib/session.ts`: save/clear/restore, malformed JSON, missing keys.
- `lib/api.ts`: URL/query construction, 401 handling, download filename parsing.
- Small components with branching: Badge, Segmented, EmptyState, pagination controls.
- Do not duplicate E2E coverage with large component snapshots.

### 4.5 Playwright E2E journeys

Smoke set (PR gate, target under 10 minutes):

1. Login with seeded tenant -> dashboard loads; wrong password error; logout clears session.
2. Dashboard attention panel: counts, deep links, expiring badge.
3. Bookings: list, search `airport`, filter status, open detail, create -> assign -> complete, cancel.
4. Command palette: open with keyboard, type, debounce, keyboard navigation, select -> URL + event-driven filter.
5. Activity: load, filter by entity, pagination.
6. Fleet: cabs search + compliance badge, drivers search + license badge.
7. Exports: bookings CSV and reports CSV download, correct filename, row count, BOM/injection text.
8. Reports: date range changes totals and export.
9. Settings: branding update reflected on public page (dedicated test tenant).
10. Responsive: dashboard and bookings at mobile viewport.

Full/nightly set adds: signup, users/roles, entitlement gates, cross-browser (Chromium/Firefox/WebKit), visual snapshots, a11y scans, error/empty states, 401 redirect, slow-network behavior.

E2E rules:

- `storageState` from a setup project; no UI login per test.
- Unique tenant per worker; API-seeded fixtures; no demo data dependency.
- Web-first assertions (`expect(locator).toBeVisible()`), never fixed sleeps.
- `trace: on-first-retry`, screenshot/video only on failure.
- Retries: 0 locally, max 2 in CI; any test needing a retry is a flake ticket, not a pass.
- Quarantine tag with owner and issue; quarantine still runs but does not block, reviewed weekly.

### 4.6 Accessibility

- Run axe on login, dashboard, bookings, activity, reports, and the open command palette.
- Fail on `serious` and `critical` violations for WCAG 2.2 A/AA tags.
- Keyboard-only pass: palette, dialogs, table actions, pagination, filters.
- Manual checks: focus visible, focus order, labels, error announcements, color contrast (axe covers much but not all), screen-reader smoke on the booking flow.
- Keep a short manual checklist in the repo; automated a11y is necessary but not sufficient.

### 4.7 Visual regression

- Only stable, high-value surfaces: dashboard, bookings table, palette open, activity, mobile dashboard.
- Fixed browser/OS in CI (same image locally and in CI), `maxDiffPixelRatio` small, animations disabled, dynamic dates/IDs masked.
- Treat visual diffs as review artifacts; do not auto-accept.

### 4.8 Performance (k6)

Start with a baseline, then encode thresholds:

- smoke: 1–5 VUs, 2 minutes, PR-optional/nightly;
- load: browse 70%, booking write 20%, export 10%; ramp to expected peak;
- thresholds: `http_req_failed < 1%`; p95 latency provisional `< 500 ms` for reads and `< 800 ms` for writes/exports until a real baseline is measured;
- gates: no >20% regression against the stored baseline; hard fail on error-rate threshold;
- test data: dedicated tenant, cleanup after run; exports bounded to avoid 5000-row noise.

### 4.9 Security

- ZAP baseline (passive) per PR against an ephemeral stack; authenticated where possible; rules file for accepted findings; fail on High/Critical.
- ZAP API scan against `/openapi.json` on nightly/release; full active scan on release candidates only, against an isolated environment.
- BOLA/IDOR two-account tests are part of the backend suite, not only the scanner.
- Dependency gates: `pip-audit`, `npm audit --omit=dev`, Dependabot; SBOM artifact on release.
- ASVS Level 2 mapping for auth, session, access control, validation, logging, and data protection; track gaps as tickets with ASVS IDs.
- Separate decision: `localStorage` token storage is an XSS exposure; evaluate httpOnly cookies + CSRF protection before calling the product saleable.

## 5. Quality gates

| Gate | PR | Nightly | Release |
|---|---|---|---|
| TypeScript `tsc --noEmit` | must pass | must pass | must pass |
| ESLint / Ruff | must pass (after adoption) | must pass | must pass |
| Backend unit + integration | must pass | must pass | must pass |
| Coverage | no decrease; core >=85% lines target | trend report | no decrease |
| Mutation score (core modules) | n/a | >=60% initial, >=75% target | report |
| Frontend unit | must pass | must pass | must pass |
| E2E smoke | must pass (<10 min) | must pass | must pass |
| E2E full + 3 browsers | n/a | must pass | must pass |
| Flake rate | <1% rolling | <1% | <1% |
| ZAP baseline | 0 High/Critical | 0 High/Critical | 0 High/Critical |
| ZAP API/full | n/a | API scan | full scan, triaged |
| Accessibility | key pages: 0 serious/critical | full key-page set | full key-page set |
| Performance | smoke thresholds | load thresholds | no >20% regression |
| Dependencies | no new Critical/High | audit report | SBOM + audit |
| Migration | upgrade test | upgrade test | upgrade from previous release |

Coverage and mutation numbers are starting targets, not truths; adjust after the first baseline. The non-negotiable gates are: tests pass, no cross-tenant leak, no High/Critical security finding, no serious/critical a11y violation on key pages, and no unexplained flake.

## 6. Phased rollout

### Phase 0 — Harness and CI skeleton (0.5–1 day)

- Add coverage, Hypothesis, Schemathesis, time-machine to the backend dev dependencies (after compatibility check).
- Add Vitest + React Testing Library, Playwright, axe to the frontend dev dependencies.
- Add `make verify` (typecheck, lint, backend tests, frontend unit, build) and `make e2e`.
- Add CI workflow skeleton (inactive until the repo is hosted) with cached dependencies, JUnit/coverage artifacts, and concurrency cancellation.
- Acceptance: `make verify` is green locally; a deliberately broken assertion fails it.

### Phase 1 — Close the backend truth gaps (2–3 days)

- Tests for auth rate limiting, JWT tampering/expiry, users/settings/public branding, cabs/drivers/customers CRUD and role matrix.
- Tests for search, activity, attention, reports, both CSV exports.
- Expand isolation matrix to every resource and to search/activity/reports/exports.
- Add audit-failure rollback regression, readyz DB-down, CORS, pagination bounds.
- Acceptance: every route has at least one success, one authorization, and one validation test; two-tenant leakage tests exist for every read/export surface.

### Phase 2 — Contract, property, and time (2 days)

- Schemathesis against the ephemeral stack; zero 500s on generated cases.
- Hypothesis properties for CSV sanitizer, expiry classification, report totals, search caps.
- Time-machine boundary suite for expiry and report ranges.
- Migration upgrade test from the previous revision.
- Acceptance: contract suite runs in CI <5 minutes; property tests fail on a seeded defect.

### Phase 3 — Playwright and accessibility (3–4 days)

- Playwright config with setup project, storageState, trace-on-retry, CI reporters.
- Smoke journeys listed in 4.5; API-seeded tenant fixtures.
- axe checks and manual keyboard checklist for key pages.
- Visual baselines for 4–5 stable surfaces.
- Acceptance: smoke suite <10 minutes, 0 flakes across 10 consecutive runs, 0 serious/critical axe findings.

### Phase 4 — Security, performance, mutation (2–3 days)

- ZAP baseline per PR, API scan nightly, full scan release; rules file and triage workflow.
- k6 smoke + load scripts; store baseline; encode thresholds.
- Mutation spike (mutmut vs cosmic-ray), then nightly runs on core modules.
- Dependency audits and SBOM.
- Acceptance: pipeline fails on a seeded High finding and on a seeded performance regression; mutation report identifies weak assertions.

### Phase 5 — Observability and ratchets (1–2 days)

- JUnit/SARIF/HTML artifacts, PR summary comment, duration/flake/queue metrics.
- Quarantine workflow with owner and issue; weekly review.
- Coverage and mutation ratchets; regression-test policy for every escaped bug.
- Acceptance: dashboard answers "what is slow, what is flaky, what is weak, what changed" without reading logs.

Estimated total: ~2 weeks of focused work, with Phase 1 delivering the highest risk reduction first.

## 7. Anti-patterns to reject

- 100% coverage as a goal; coverage without assertions.
- E2E for validation, authorization, or date math that the API layer can prove.
- Retries as a flake fix; `sleep` instead of web-first assertions.
- Shared mutable demo data across tests or workers.
- Mocking the database in integration tests; mocking the tenancy layer in isolation tests.
- Snapshot tests of whole pages; assertions on CSS classes or implementation details.
- AI-generated tests merged without oracle review and a fail-when-broken check.
- Active DAST against production; unauthenticated-only scans passed off as coverage.
- Treating a timed-out scan as a pass.
- Testing third-party providers instead of our contract with them.

## 8. Open decisions

1. **Repository/CI host.** `cab-booking-saas` is not a git repository and has no remote. Until it is hosted, `make verify` is the source of truth; the GitHub Actions YAML should be written but cannot run. Where will it live?
2. **Browser/device matrix.** Default proposal: Chromium on PR; Chromium + Firefox + WebKit nightly; one mobile viewport (iPhone 13) nightly.
3. **SLO numbers.** The provisional k6 thresholds need a measured baseline on the target host before they become release gates.
4. **Mutation tool.** Choose mutmut or cosmic-ray after a short Python 3.12 compatibility spike; do not install blind.
5. **Token storage.** Moving JWTs out of `localStorage` into httpOnly cookies is a security architecture change with CSRF implications. Decide whether it is in scope before release hardening.
6. **Test tenant lifecycle.** Proposal: tests create and delete their own tenants; a dedicated long-lived staging tenant is only for manual demos and visual baselines.

## 9. Source index (retrieved 2026-10-19)

Primary guidance and documentation:

- OWASP Multi-Tenant Security Cheat Sheet — https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.md
- OWASP DevSecOps Guideline, DAST — https://owasp.github.io/DevSecOpsGuideline/2-Process/2-4-Test/2-4-2-Dynamic-Application-Security-Testing/
- OWASP DevSecOps Guideline, API Security — https://owasp.github.io/DevSecOpsGuideline/2-Process/2-4-Test/2-4-4-API-Security/
- OWASP API Security Testing Framework, testing guidelines — https://github.com/OWASP/www-project-api-security-testing-framework/blob/main/docs/TESTING_GUIDELINES.md
- ZAP Baseline GitHub Action — https://github.com/zaproxy/action-baseline
- ZAP + GitHub Actions (project blog) — https://www.zaproxy.org/blog/2020-04-09-automate-security-testing-with-zap-and-github-actions/
- WSO2, dynamic analysis with ZAP (scan cadence/policy) — https://security.docs.wso2.com/en/latest/security-guidelines/secure-engineering-guidelines/dynamic-analysis-with-owasp-zap/
- Microsoft Zero Trust, API security testing in CI/CD — https://microsoft.github.io/zerotrustassessment/docs/workshop-guidance/devsecops/DS_116
- Playwright best practices — https://playwright.dev/docs/best-practices
- Playwright test isolation — https://playwright.dev/docs/test-isolation
- Playwright retries — https://playwright.dev/docs/test-retries
- Playwright accessibility testing — https://playwright.dev/docs/accessibility-testing
- Playwright first-party best-practices source — https://github.com/microsoft/playwright/blob/main/docs/src/best-practices-js.md
- Grafana k6 API load testing — https://grafana.com/docs/k6/latest/testing-guides/api-load-testing/
- GitHub Learn, effective CI — https://learn.github.com/well-architected/productivity/recommendations/effective-ci
- Schemathesis Python app testing (in-process ASGI/WSGI) — https://schemathesis.readthedocs.io/en/stable/guides/python-apps/
- OWASP ASVS — https://owasp.org/www-project-application-security-verification-standard/

Studies and practitioner analyses:

- Kim, Qi, Sinha, Orso, "Automated test generation for REST APIs: no time to rest yet" — DOI 10.1145/3533767.3534401
- Jia & Harman, "Higher Order Mutation Testing" — DOI 10.1016/j.infsof.2009.04.016
- "Software Testing with Large Language Models: An Interview Study with Practitioners" — https://arxiv.org/html/2510.17164v1
- Autonoma, "Why Multi-Tenant SaaS Testing Starts with Data Isolation" — https://getautonoma.com/blog/multi-tenant-saas-testing
- Autonoma, "Multi-Tenancy Testing: What Breaks and How to Catch It" — https://getautonoma.com/blog/multi-tenancy-testing-failure-modes
- Total Shift Left, testing strategy for SaaS platforms — https://totalshiftleft.ai/blog/testing-strategy-saas-platforms (bot-blocked to automated fetch; consulted via search excerpt)
- QAPractices, CI/CD testing pipeline and quality gates — QAPractices.com (2026)
- onpathtesting.com, "The Test Pyramid in 2026: Still Relevant, Still Necessary"
- Medium, "The Test Pyramid Is Outdated — Here's What Replaced It"
- BrowserStack, Playwright best practices / flaky-test guidance (2026)
- QASkills.sh, multi-tenant SaaS testing and retries/flaky-test handling guides (2026)
- Stack Overflow Developer Survey 2026, AI/testing section
- GitHub Learn effective-CI checklist; GitHub Docs on Actions security (pinned actions, OIDC, least privilege)

Local evidence:

- `backend/tests/` (22 passing tests, 2026-10-19)
- `backend/tests/conftest.py` (testcontainers Postgres, ASGI client, rate limiting disabled)
- `backend/pytest.ini`, `backend/requirements.txt`, `Makefile`, `docker-compose.yml`
- `frontend/package.json` (typecheck only), `frontend/src/lib/session.ts` (localStorage tokens)
