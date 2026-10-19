# RESEARCH — Cab Booking SaaS (verified 2026-10-18)

Every architectural decision below was verified online **before** any code was written.
Sources were read directly (not just snippets) where marked ✅.

## 1. Multi-tenancy model

**Decision: shared-schema pool model + PostgreSQL Row-Level Security (RLS), with a
per-tenant `silo` escape hatch and geo-routing hook for future sharding.**

Verified against primary docs:

- ✅ PostgreSQL 18 docs — Row Security Policies (fetched 2026-10-18):
  - Tables are **default-deny** once RLS is enabled and no policy matches.
  - Permissive policies combine with `OR`, restrictive with `AND`
    (`CREATE POLICY ... AS RESTRICTIVE`).
  - **Superusers and `BYPASSRLS` roles always bypass RLS**; table owners bypass by
    default → must use `ALTER TABLE ... FORCE ROW LEVEL SECURITY` so migrations
    owner is also subject.
  - `USING` vs `WITH CHECK` control visibility vs writability — both needed for
    UPDATE/INSERT correctness.
  - Referential-integrity checks **bypass RLS** → risk of covert-channel leaks;
    keep FKs within tenant rows (composite keys include `tenant_id`).
  - Sub-`SELECT` policies can race under READ COMMITTED → prefer simple
    row-local predicates for the tenant policy.
  - `row_security = off` turns silent filtering into an **error** — useful for
    backups/background jobs.
  - Source: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- ✅ Nile Engineering — "Shipping multi-tenant SaaS using Postgres Row-Level
  Security" (254 HN points; fetched 2026-10-18):
  - Root failure mode of `WHERE tenant_id = ...`: forgetting the filter **leaks**;
    RLS **fails closed**.
  - Policies are tied to **tables, not queries** → defined once, applied everywhere.
  - Use a dedicated non-owner DB role (`app_user`, NOSUPERUSER, NOBYPASSRLS) for
    the app.
  - Recursive policies (admin checks querying the same table) → infinite loop;
    solve with `SECURITY DEFINER` functions, carefully (`search_path` hardening).
  - Request-scoped tenant/user must be reset between requests (their bug: reused
    thread-local leaked previous tenant).
  - Write paths change: authorization happens at query time → failed writes
    surface as 404/zero-row, handle at app layer.
  - Log tenant/user ID at every step (parse → set → DB) + integration tests with
    Testcontainers for every access pattern.
  - Source: https://www.thenile.dev/blog/multi-tenant-rls
- ✅ PgBouncer / pooling interactions (multiple sources; StackOverflow #80003232
  documents a real cross-tenant leak):
  - Session state via plain `SET` leaks across transactions in transaction-pooling
    mode. Use **transaction-scoped** `SELECT set_config('app.current_tenant', :t, true)`
    inside the same transaction as the queries, or session mode.
  - Corroborated by free-search multi-engine results
    (now-next.nl, dev.to, thecodeman.net).
- AWS guidance (pool/bridge/silo; verified via search + AWS SaaS Lens well-architected):
  full-pool for the masses, silo tiers for enterprise; automated self-serve
  provisioning is a Well-Architected SaaS Lens question (OPS_3).
- Noisy neighbors: Azure Architecture Center "Noisy Neighbor" + "Throttling"
  patterns and AWS SaaS Lens → per-tenant rate limiting, priority queues,
  statement timeouts, per-tenant quotas. Rate limiter at Redis level for this repo.

## 2. Backend stack

**Decision: FastAPI + SQLAlchemy 2.0 async + asyncpg + Pydantic v2 +
pydantic-settings + PyJWT + Alembic + Gunicorn/Uvicorn.**

- ✅ FastAPI official tutorial (fetched 2026-10-18): one `Session` per request via
  a `yield` dependency; `Annotated` dependency style; **use Alembic for
  production migrations** (vendor's own note).
  https://fastapi.tiangolo.com/tutorial/sql-databases/
- PyJWT over python-jose: python-jose has unpatched CVEs (algorithm
  confusion / RSA key confusion); FastAPI docs themselves moved away from it.
- JWT `sub` claim must be a **string** (JWT spec) — encode user IDs as str.
- Access token 15–30 min + refresh token rotation; short-lived access tokens
  limit RLS-context abuse windows.
- Async SQLAlchemy 2.0 (`AsyncSession`, `asyncpg`) is the 2026 baseline for
  FastAPI+Postgres services (multiple industry post-mortems, e.g.
  fastapi-production-boilerplate patterns).

## 3. Frontend stack

**Decision: Next.js 15 (App Router) + React + TypeScript + Tailwind CSS v4 +
shadcn/ui conventions + PWA (manifest + service worker) + runtime white-label
theming via CSS variables.**

- Framework choice — Stack Overflow Developer Survey 2026: React remains the
  most-desired web framework; SvelteKit highest "admired" but Next.js is the
  safest SaaS default (hiring, ecosystem, RSC).
- ✅ Next.js official PWA guide (updated 2026-07-30, fetched 2026-10-18):
  - `app/manifest.ts` (typed manifest) + HTTPS → installable.
  - Web Push via service worker + VAPID keys (`web-push` CLI) — viable native
    replacement; iOS ≥16.4 needs home-screen install.
  - Security headers in `next.config.ts` (nosniff, frame-deny, referrer policy;
    service worker: `no-store` + strict CSP).
  - Offline: experimental `useOffline` + Serwist for full SW caching.
  - Source: https://nextjs.org/docs/app/guides/progressive-web-apps
- ✅ Tailwind CSS v4 official theme docs (fetched 2026-10-18):
  - Design tokens live in **`@theme`**; namespaces map to utilities
    (`--color-*`, `--font-*`, `--radius-*`, ...).
  - `@theme inline` needed when a theme var references another var (avoids
    resolution surprises) — exactly the shadcn/ui pattern.
  - Theme vars are emitted as regular CSS variables → can be **overridden at
    runtime** per tenant without rebuilding CSS.
  - Source: https://tailwindcss.com/docs/theme
- ✅ shadcn/ui docs (fetched 2026-10-18 via gitmcp): components AND theming via
  CSS variables; Tailwind v4 support documented; dark mode guide; RTL guide;
  charts via Recharts; data-table, sidebar, sonner toasts — catalog used as the
  component base. https://ui.shadcn.com/docs
- White-label theming (multi-source, cross-checked):
  - Runtime strategy: one static Tailwind bundle compiled once; server injects a
    small `:root { --... }` override block per tenant → any hostname/custom
    domain themable with no rebuild (mironsoft.de; css-architecture.com).
  - Security: tenant-supplied colors MUST be validated (hex regex allowlist)
    before CSS injection — CSS injection is a real attack
    (`#000; } body{display:none} /*`). Validate on save **and** on render, with
    fallback to defaults.
  - Token layering: primitives → semantic → component; tenants may only override
    semantic accents; enforce contrast in CI.
  - Tenant lookup by `Host` header (subdomain or CNAME custom domain), cached in
    Redis with short TTL.

## 4. Mobile strategy

**Decision: PWA-first (installable, push-capable, offline-tolerant).**
The Next.js official PWA guide (above) + 2026 write-ups (wolf-tech.io) agree for
B2B SaaS: one codebase, instant updates, no app-store gatekeeping. Native
(Expo/React Native) is only warranted for a future driver-facing app needing
background GPS; architecture keeps the API ready for it.

## 5. Feature entitlements / plan gating

**Decision: entitlements (plan capabilities, billing is source of truth) separate
from release flags; enforcement server-side; stored per tenant in DB.**

- Verified guidance (Unleash, GrowthBook, OpenFeature docs): separate release
  toggles from **entitlements**; never trust client-side gating; tenant-first
  targeting; OpenFeature is the emerging vendor-neutral standard — the DB table
  design here stays portable to it later.
- In-house `tenant_settings.features` JSONB + `plan` column is sufficient at this
  stage; no external SaaS dependency.

## 6. Deployment

**Decision: root `docker-compose.yml` with postgres, redis, backend, frontend,
caddy. Two networks; only the proxy publishes ports.**

Verified 2026 best practices (tutorialshub.be, Docker docs, multiple):
- `backend` network `internal: true`; DB/redis never publish ports.
- `healthcheck` + `depends_on: condition: service_healthy` + `start_period`.
- Secrets via env with `.env.example`, real `.env` git-ignored.
- Caddy for TLS termination (automatic HTTPS); pin image major tags.
- Lifeness `/livez` vs readiness `/readyz` endpoints for container health.

## 7. Cab/flight booking domain notes

- Domain model verified against legacy console app the user wants replaced:
  Customers, Drivers, Cabs, Bookings (create / complete / cancel), simple
  revenue reporting. Modern SaaS adds: per-tenant branding, roles, audit log,
  tenant-level fare settings.
- Kaggle search found public NYC-taxi/Uber fare datasets usable later for demo
  seeding (e.g. "Uber and Lyft Price Prediction"); not bundled (license).

## Source index (all retrieved 2026-10-18)

| # | Source | Used for |
|---|--------|----------|
| 1 | https://www.postgresql.org/docs/current/ddl-rowsecurity.html | RLS semantics ✅ |
| 2 | https://www.thenile.dev/blog/multi-tenant-rls | RLS production gotchas ✅ |
| 3 | https://fastapi.tiangolo.com/tutorial/sql-databases/ | FastAPI DB pattern ✅ |
| 4 | https://nextjs.org/docs/app/guides/progressive-web-apps | PWA strategy ✅ |
| 5 | https://tailwindcss.com/docs/theme | Tailwind v4 tokens ✅ |
| 6 | https://ui.shadcn.com/docs | Component/theming conventions ✅ |
| 7 | https://learn.microsoft.com/azure/architecture/antipatterns/noisy-neighbor | Throttling |
| 8 | https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/noisy-neighbor.html | SaaS isolation |
| 9 | https://aws.amazon.com/blogs/apn/tenant-onboarding-best-practices-in-saas-with-the-aws-well-architected-saas-lens/ | Self-serve provisioning |
| 10 | https://stackoverflow.com/questions/80003232 | PgBouncer RLS leak |
| 11 | https://www.mironsoft.de/en/blog/tailwind-white-label-theming-without-rebuild-runtime-variables | White-label runtime theming |
| 12 | https://www.css-architecture.com/multi-brand-theming-white-label-token-architecture/ | Token layering + CSS-injection hardening |
| 13 | https://northflank.com/blog/multi-tenant-saas-platform-deployment | Deployment 2026 |
| 14 | https://qrvey.com/blog/multi-tenant-deployment/ | Tenant lifecycle |
| 15 | https://openfeature.dev / unleash / growthbook docs | Entitlements vs flags |

## 8. Product & UX baseline — 2026/2027 (retrieved 2026-10-19)

Second research pass, run before any product edits, across 13 tool families
(Exa/websearch, free-search, openresearch, DuckDuckGo, agent-reach, paper-search,
Hacker News, Stack Overflow, GitHub, Kaggle, Wikipedia, GSD websearch, superpowers).
Hacker News had no domain-relevant discussions; GSD websearch is not configured
(empty); superpowers skills contain no design-review guidance. Everything below is
corroborated by at least one source read directly.

### 8.1 Booking & channel baseline

- Market feature baseline for taxi booking software 2026 (taxi-webdesign.com,
  June 2026; guideflow.com, July 2026; worldmetrics.org, Feb–Aug 2026):
  **booking channels** (branded passenger app, web widget, phone, kiosk, corporate
  portal, third-party API) and **operational depth** (chain dispatch, zone-based
  pricing, reporting, audit logs, corporate accounts with cost centres) separate
  serious platforms from basic ones. Rankings consistently include Cordic, Onde,
  Moveo, iCabbi, Autocab, TaxiCaller, Gazoop.
- Widget vs portal (codico.io, Jan 2026): a **web booking widget** optimises for
  minimum-friction point-to-point booking; a **full portal** adds account
  management, history, invoices. Converging recommendation: offer the widget
  first, portal later.
- "14 highest-converting taxi booking app features" (taxi-webdesign.com, May
  2026): fare transparency, saved places/contacts, live ETA, multiple payment
  options, ride history — conversion ranked, not just presence.

### 8.2 Dispatch board & operations UX pattern (convergent across 6+ sources)

- FSM Navigator dispatch board docs: one screen = **live map + live status cards
  + live dispatch feed (activity log, last 24h, load-older, auto-scroll) +
  searchable job/technician tabs**. Best practice: start the day on the board,
  minimise unassigned jobs, watch for overloaded technicians. `Ctrl+K` global
  search by job ID, customer, or location.
- RushHour dispatch board docs: routes / map / unassigned-orders panels; **date,
  zone filters; view state kept in the URL so boards are shareable/bookmarkable**;
  compact vs comfortable density; role layouts.
- Fleiko dispatch board help: job cards with priority + status; drawer with
  **status history, proof, messages**; saved views; command palette finds jobs,
  drivers AND customers ("two taps or three words"); **alerts for exceptions**:
  running late, ETA slipping, vehicle idle on an active job, geofence exit,
  licence about to expire, new booking request.
- Volpis fleet UX (Apr 2026) + Contra Fleetops case + VP0 journal (May 2026):
  - One **hero question per role**. Dispatcher: *"What needs my attention right
    now?"*; manager: *"How did we do this week?"*
  - KPI triage: 1 hero tile + 3–5 context tiles + drill-down; every KPI with
    trend; semantic colour only (red=incident, amber=warning, green=healthy).
  - **Exception-first**: surface what needs action; let the normal recede ("Op
    AI" one-sentence banner above KPIs).
  - Mature fleet maps: cluster by default, status-before-identity colours, map +
    side rail (not tabs), **always show data freshness** ("last updated"); never
    present stale positions as live.
  - Large data: aggregate server-side, virtualise lists, role-based time-window
    defaults, filters as first-class citizens.
  - Fleet Status: same data in table / cards / map views.
- Audit/what-changed visibility is a repeated requirement: dispatch feed,
  status history in drawer, activity notes — realised here by the existing
  `AuditLog` (written on every mutating route) once exposed via API + UI.

### 8.3 Compliance & fleet-management functions (Wikipedia FMS + sources)

Canonical FMS function set (Wikipedia "Fleet management software", last edited
2026-08-11): vehicle inventory, **maintenance scheduling**, **licensing /
registration / MOT / tax due dates**, **insurance due dates**, cost analysis,
disposal; driver **licence management with expiry**, scoring, penalty points,
SOS; incident management; telematics / real-time location; logbooks and work
time; alerts. Sources agree expired-licence/insurance and overdue maintenance
are the top operational exceptions operators track daily.

### 8.4 Multi-tenant & platform engineering (2026 state)

- Postgres RLS is the **2026 default** for new multi-tenant SaaS (multiple
  Jan–Jul 2026 engineering posts; 5–15% planner overhead accepted). CabDesk
  already ships RLS + FORCE policies + non-owner role — aligned with the
  current consensus; retain as-is.
- Known pitfalls (Stack Overflow + posts): RLS performance regression reports,
  RLS vs updatable views, trigger/RLS ordering — all already handled by the
  current architecture's simple row-local policies.

### 8.5 Academic / algorithmic (future auto-dispatch)

paper-search (arXiv/OpenAlex/Crossref) shows the established trajectory:
receding-horizon control dispatch (−52% idle distance, Miao et al.),
value-based unified dispatch/repositioning (V1D3, KDD Cup 2020 winners),
en-route-time-aware pricing (Kleywegt & Shao), cooperative-Markov order
dispatching (KDD 2024), driver-behaviour-based assignment (IEEE 2026), and
2026 fare-estimation transparency research (SSRN). Conclusion: keep manual
assignment + explicit fare now; these inform a later auto-dispatch/zones phase
rather than this release.

### 8.6 Open-source competitive benchmark

`blinks32/Complete-Taxi-Booking-Parcel-Delivery-Solution` (⭐354, Ionic/Angular
super-app, README read 2026-10-19; marketing page for a paid template): 5 apps
(rider, driver, admin, vendor, B2B corporate dispatcher), bid-based pricing,
background GPS, push, commission variables, driver onboarding approval,
offline-first sync, kiosk/hotel B2B. Confirms the market expects multi-surface
ecosystem + B2B — out of scope for a single release, but the corporate/
dispatcher-side gap is real.

### 8.7 Data (Kaggle, 2026-10-19)

Standard public taxi datasets (NYC Yellow Taxi, Chicago Taxi Trips, Uber
pickups; fare-prediction sets, 40k+ downloads). Useful later for demo seeding
and analytics benchmarks; nothing to bundle now.

## 9. Capability gap matrix (evidence-verified 2026-10-19)

Status legend: ✅ exists · ◐ partial · ✗ missing. Priority: P0 = this release
(high impact, fits current stack), P1 = next, P2 = later roadmap.

| # | Capability (2026/2027 baseline) | Status | Evidence basis | Priority |
|---|--------------------------------|--------|----------------|----------|
| 1 | Command palette entity search (bookings, customers, drivers, cabs) | ✗ (palette = pages/actions only; bookings search is client-side, page-local) | Fleiko, FSM Navigator `Ctrl+K` | P0 |
| 2 | Activity feed / status history surfaced from audit trail | ◐ (AuditLog written everywhere; no API/UI) | Fleiko drawer, FSM feed | P0 |
| 3 | Compliance expiry tracking (driver licence, vehicle insurance/registration) + alerts | ✗ (`license_no` only, no dates) | Wikipedia FMS, Fleiko alert, Volpis queue | P0 |
| 4 | Data export (CSV) of bookings/reports | ✗ (no export in backend) | Wikipedia FMS "…report on and export", Volpis | P0 |
| 5 | Needs-attention / exception-first panel (unassigned, late, expiring, overdue) | ✗ | Volpis hero question, Contra banner, FSM "minimise unassigned" | P0 |
| 6 | Booking detail view w/ timeline + notes + messages | ✗ (inline actions only) | Fleiko drawer, RushHour markers | P1 |
| 7 | Server-side search across records | ◐ (status filter server-side; text search page-local) | Volpis pattern 6 | P1 |
| 8 | Customer booking widget / self-serve portal (tenant-branded) | ✗ | codico.io, taxi-webdesign channels | P1 |
| 9 | Dispatch board (unassigned queue + driver status + feed; map later) | ✗ | FSM, RushHour, Fleiko | P1 |
| 10 | Notifications (email/SMS on booking events) | ✗ | market baseline | P1 |
| 11 | Payments / invoices / refunds | ✗ | baseline + payments-focused 2026 buyers | P2 |
| 12 | Corporate accounts with cost centres / B2B desk | ✗ | taxi-webdesign, OSS benchmark | P2 |
| 13 | Ratings & feedback on completed trips | ✗ | converting-features list | P2 |
| 14 | Multi-language / multi-currency | ◐ (currency setting only; no i18n) | baseline | P2 |
| 15 | Open API / webhooks for third parties | ✗ | taxi-webdesign channels | P2 |
| 16 | Auto-dispatch rules, zones/tariffs, surge | ✗ (manual assign; flat fare settings) | academic §8.5, market | P2 |
| 17 | Live GPS map, driver & passenger apps | ✗ | baseline | P2 |
| 18 | SOS, voice AI, flight tracking, route optimisation, multi-stop | ✗ | differentiators | P2 |
| 19 | Multi-tenant RLS isolation | ✅ | §8.4 | — |
| 20 | White-label branding + runtime theming | ✅ | RESEARCH §3 | — |
| 21 | Entitlements / plan gating | ✅ | RESEARCH §5 | — |
| 22 | PWA installable (manifest + service worker) | ✅ | `manifest.ts`, `sw.js` | — |

P0 batch rationale: items 1–5 all reuse existing data (audit trail, fleet
records, booking statuses) and bring the dispatcher console in line with the
2026 convergent standard — "one screen that answers *what needs my attention*,
with everything searchable and exportable." Items 6–10 are the next tier;
items 11–18 are new surfaces/ecosystems tracked for the roadmap.

### 9.1 Source additions (retrieved 2026-10-19)

| # | Source | Used for |
|---|--------|----------|
| 16 | https://www.taxi-webdesign.com/best-taxi-booking-software-manage-bookings-payments-2026 | Market channel/feature baseline |
| 17 | https://codico.io/web-booking-widget-vs-full-booking-portal/ | Widget vs portal |
| 18 | https://www.taxi-webdesign.com/best-taxi-booking-app-features-that-convert-riders-2026 | Conversion feature list |
| 19 | https://www.guideflow.com/blog/taxi-dispatch-software | Dispatch platform criteria |
| 20 | https://fsmnavigator.com/docs/scheduling/dispatch-board/ | Dispatch board anatomy |
| 21 | https://docs.rushhourapp.com/company-portal/dispatch/dispatch-board | Board filters/URL state |
| 22 | https://fleiko.com/help/dispatch-board | Exception alerts, palette search |
| 23 | https://volpis.com/blog/user-experience-design-of-fleet-management-apps/ | Hero question, KPI triage, map rules |
| 24 | https://vp0.com/blogs/fleet-tracking-mobile-dashboard-ui | Exception-first, freshness |
| 25 | https://en.wikipedia.org/wiki/Fleet_management_software | Canonical FMS function set |
| 26 | https://github.com/blinks32/Complete-Taxi-Booking-Parcel-Delivery-Solution | OSS feature benchmark |
| 27 | https://stackoverflow.com/questions/41186880 (and neighbours) | RLS operational pitfalls |
| 28 | arXiv 1603.04418 · 2105.08791 · 2111.11551; DOI 10.1145/3637528.3672028; DOI 10.24963/ijcai.2021/515; DOI 10.1109/isitia71267.2026.11642394; DOI 10.2139/ssrn.7231159 | Dispatch/pricing literature |
