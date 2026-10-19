# Verification log

Everything below was executed against this repository; commands are reproducible.

## Backend test suite — PASSED

`make test` (pytest, ephemeral Postgres via testcontainers, migrations applied
per session): **22 passed**.

Coverage highlights:

- Tenant isolation: lists are scoped per tenant; cross-tenant inserts are
  rejected by composite FKs.
- RLS fails closed: requests without tenant context see zero rows.
- Auth: forged/garbage JWTs → 401; refresh rotation works; re-used refresh
  token revokes the family; wrong tenant slug / wrong password → 401.
- Quotas: cab and user limits enforced with 402/403 semantics.
- Branding: `public_tenant_branding` returns only whitelisted, hex-validated
  fields.

## Backend production image — PASSED

Production Docker image smoke test: entrypoint ran `alembic upgrade head`,
`/livez` + `/readyz` healthy, demo seed loaded, login OK, RLS-scoped bookings
list OK, wrong-tenant login 401, `/public/branding` OK.

## Frontend — PASSED

- `npx tsc --noEmit` — clean (strict TS).
- `npx next build` — 15 routes compiled; standalone output produced.
- Tailwind v4 emitted the dynamic-opacity utilities used by the UI
  (`bg-danger/8`, `bg-black/45`, …) — verified in the built CSS bundle.
- Standalone server smoke test: `/login` 200, `/manifest.webmanifest` 200,
  `/icons/icon-192.png` 200, BFF proxy returns a structured 502 when the
  upstream API is unreachable.
- Frontend Docker image builds and its HEALTHCHECK hits `/login`.

## Full stack via docker compose — PASSED

`make init && make up` (Caddy → web → api → db/redis) then:

- `pg_isready` healthy; api and web containers healthy.
- Demo seed idempotent (second run: "already exists, nothing to do").
- Via Caddy: login page 200, `public/branding?slug=demo-cabs` returns the
  demo brand, login as `owner@demo-cabs.io` OK, `/bookings` total 18 under
  RLS, `/reports/summary` totals match (18 bookings, revenue 291.34).
- Live cross-tenant check: signed up `acme-cabs`; its bookings and cabs
  total 0 (demo's data invisible), duplicate slug → 409, no token → 401.

Notes:

- On the development sandbox host, ports 80/8080 were already in use by
  unrelated services, so the Caddy container was run manually on 9080 for
  the E2E run. On a clean VM, `SITE_ADDRESS=:80` (default) binds normally.
- `docker-compose.yml` also publishes 8080 so tests can run behind an
  occupied port 80 (`SITE_ADDRESS=:8080`).

## UI interaction pass — PASSED (2026-10-18)

Playwright-driven, against the live stack at `http://localhost:9080`
(desktop 1440×900 and mobile 390×844, light and dark):

- Command palette: with the fuzzy threshold (score ≥ 0.1 wrapping cmdk's
  `defaultFilter` in `command-palette.tsx`), "rep" → only Reports,
  "dsh" → Dashboard only, "dark" → Toggle theme only; Enter navigates.
  Before the filter, scattered fuzzy noise (scores 0.017–0.028) leaked
  unrelated items — "rep" matched "Toggle theme" at 0.017.
- Console: after access-token expiry on /reports, exactly two 401s
  (`/reports/summary`, `/settings`) → one `POST /auth/refresh` 200 →
  both retried 200. No other console errors; single-flight refresh in
  `lib/api.ts` behaves as designed.
- Reports: singular "1 trip" grammar live (Lina Kassab row); KPIs
  19 bookings / $291.34 / 12 completed (63%) / 3 cancelled (16%) match
  the API. The 19th booking was created and cancelled during this pass.
- Bookings: table shows all 19 rows incl. the Playwright-created
  cancelled booking; per-status action buttons render correctly.
- Settings: custom-domain copy now reads "Custom domains aren't enabled
  for this workspace…" (the entitlement is per-tenant, not plan-derived).
- Mobile 390×844: compact header + bottom tab bar + "More" sheet (dialog
  "Menu", Escape closes); dashboard and bookings render as card layouts.
- Dark theme: reports, bookings and dashboard rendered and captured in
  dark; toggle state persists via next-themes.

Screenshots: `/home/md/src/.playwright-mcp/` (`*-desktop-dark.png`,
`*-desktop-light.png`, `*-mobile-light.png`).

## UI polish pass — PASSED (2026-10-18)

Playwright-driven, against the rebuilt stack at `http://localhost:9080`
(web + api images rebuilt; data reseeded via
`python -m scripts.seed_demo --reset` → 36 bookings, 26 completed,
4 cancelled, 3 assigned, 3 pending):

- Dashboard (dark): KPI sparkline renders above the Bookings stat; the
  14-day chart shows spread bars with correct zero-day gaps (no stubs on
  Oct 6/10/13–15) and "totalling 17 bookings. Peak of 4 bookings on
  2026-10-12." in the chart description.
- Row-menu bug found and fixed during this pass: a first implementation
  positioned the menu with inline `translateX(-100%)`, but the
  `animate-scale-in` keyframe (`animation-fill-mode: both`) pins
  `transform`, so menus rendered off the right edge. Reimplemented with
  right-offset positioning + vertical flip near the viewport bottom;
  re-verified: right-aligned under the kebab, first item focused on open,
  Escape closes and returns focus to the trigger (`[active]`), outside
  click / scroll / resize close it.
- Assign modal: opened from a pending row, offers only active drivers
  (3 of 6 — the other 3 are on_trip), cab optional, Cancel closes.
- Light mode (desktop): bookings table alignment, two-line cells,
  right-aligned fares and badge treatments legible.
- Mobile 390×844: bookings renders the card view (customer + time,
  status chip, route with pin, fare, Assign + kebab); dashboard renders
  compact KPIs, chart and fleet status.
- Reports empty state: custom range 2026-08-01 → 2026-08-15 (no data)
  shows zeroed KPIs, "No bookings in this period." in By status,
  the designed empty state in Bookings per day, and "No completed trips
  yet in this period" in Top drivers.
- Console/network: clean on /reports (all requests 200); the only console
  errors in this pass were the designed 401 → refresh → retry pair from
  `lib/api.ts` after token expiry.

Screenshots: `round3-dashboard-dark.png`, `round3-bookings-light.png`,
`round3-bookings-mobile.png`, `round3-reports-empty.png`,
`round3-menu-fixed-dark.png` (plus the pre-fix `round3-bookings-menu-dark.png`
kept as the bug reference) in `/home/md/src/.playwright-mcp/`.

## Cold-start journey — PASSED (2026-10-19)

Fresh-tenant end-to-end in prod build via Playwright (http://localhost:9080):

- Signup `Zenith Cabs` / `zenith-cabs` (slug auto-generated from company name) → lands on dashboard, tenant-branded sidebar, `free plan` badge.
- Empty states verified on dashboard ("No bookings yet" + CTA, customers count card instead of chart), bookings, cabs, drivers, customers — all have icon + title + hint + CTA.
- Create driver (Karim Haddad) → toast "Driver added"; table + pagination render.
- Create cab (Hyundai Ioniq 5 · ZEN-100) → toast "Cab added".
- Create customer (Nadia Fares) → toast "Customer added", avatar initials, "since" date.
- Create booking (customer select, route, scheduled prefilled, fare optional) → toast "Booking created".
- Assign → modal lists only active drivers (1 of 1), cab optional; toast "Booking assigned"; inline action switches Assign → Complete.
- Complete → final fare prefilled from estimate, notes preserved; toast "Booking completed"; completed rows show no inline action.
- Dashboard updates: 1 booking, $30.00 (avg fare), 1 driver, 1 cab; chart + recent list live.
- Reports: 1 total, $30.00, 100% completed, By status (Completed 1 · 100%), chart, Top drivers (Karim, 1 trip).
- Settings: branding defaults (#0f766e/#f59e0b), company USD/UTC, fare 2.5/1.2/0.3, custom domain gated message, plan card (free plan · up to 50 cabs · 10 users · Reports ✓).
- ⌘K palette: Pages + Actions (Toggle theme, Sign out). Typing "Nadia" → "No results found" — entity search NOT in palette (confirmed gap).
- User menu: email · role, Settings, Sign out.
- Sign out → login page tenant-branded as "Zenith Cabs" with slug prefilled → sign back in OK.
- Console: zero messages. Network: every request 200/201 across the whole journey (signup 201, CRUD 201, assign/complete 200).

Evidence: `.playwright-mcp/coldstart-settings-dark.png`.

## P0 batch — PASSED (2026-10-19)

Playwright end-to-end against the rebuilt stack at `http://localhost:9080`
(demo tenant, seeded data plus two deliberate compliance fixtures:
Karim Saleh license → +14d, CAB-1000 insurance → +6d):

- **Dashboard "Needs attention"**: renders exception-first above the KPIs;
  all-clear tenants see no panel (verified on Zenith). Demo: 3 unassigned,
  3 overdue, 2 expiring; every row is a deep link — `/bookings?q=<name>`,
  `/drivers?q=Karim%20Saleh`, `/cabs?q=CAB-1000` — and the cab/driver pages
  open with the search prefilled and filtered.
- **⌘K entity search**: typing "airport" lists a Bookings group of 4 hits
  (muted route hint + status badge). Enter selects → `/bookings?q=airport`
  with the search box prefilled and the table server-filtered to the same
  four rows ("1–4 of 4"). *Bug found during this pass*: `onValueChange` was
  on the cmdk root (which fires for the **selected item**, not the search
  text) — the entity fetch never fired. Moved to `<Command.Input>`; verified
  after rebuild.
- **Bookings CSV export**: `bookings-2026-10-19.csv` (server-named via
  Content-Disposition) contains exactly the 4 `q=airport` rows. Cells
  starting with `+`/`=`/`-`/`@` get an `'` prefix (CSV-injection guard,
  `app/core/csv_export.py`), UTF-8 BOM for Excel.
- **Activity page**: feed grouped Today / Yesterday; today's rows show
  time-only labels; actions humanized ("Demo Owner updated a cab");
  entity filter narrows correctly (Cabs → "Showing 1 of 1").
- **Drivers compliance**: License cell shows mono `DL-207473` + amber
  "License expires 14d" badge; cabs table shows the two-line Compliance
  column (Insurance badge + muted Registration date).
- **Reports CSV export**: `reports-2026-09-20-to-2026-10-19.csv` —
  `day,bookings,revenue` rows match the selected 30-day range.
- Console clean; every network entry 200/201 on the verified pages.

Infra note: the Docker daemon restarted mid-pass and took the standalone
edge container down (`cabdesk-caddy-test` has no restart policy) — it was
restored with `docker start cabdesk-caddy-test`.

Screenshots: `.playwright-mcp/p0-dashboard-attention.png`. Downloads:
`.playwright-mcp/bookings-2026-10-19.csv`, `.playwright-mcp/reports-2026-09-20-to-2026-10-19.csv`.

## Deep sweep, roles, plans and quotas — PASSED (2026-10-19)

Post-seed-rewrite sweep against `http://localhost:9080` (Playwright + curl +
psql cross-checks). Seed fixtures (pristine `--reset` state): demo-cabs
15 cabs / 13 drivers / 27 customers / 229 bookings; zenith-cabs
4 cabs / 4 drivers / 5 customers / 13 bookings.

### Owner sweep (all pages)
Bookings create / assign / complete / cancel / CSV export, cabs add / edit /
remove, drivers add / edit / remove, customers create / edit / remove,
reports (7 / 30 / 90-day + custom range + CSV), activity filter tabs and
"Load older", settings save, ⌘K palette (pages, actions, entity search).
Every write produced its toast, and DB + audit-log rows matched the UI.

### Role matrix (browser-verified)
- **Viewer** (`viewer@demo-cabs.io`): `/reports` 403 inline "Your role does
  not allow this action"; Export buttons → 403 toast; New booking / Add /
  Edit / Remove affordances hidden on bookings, cabs, drivers, customers;
  `/settings` read-only banner with disabled inputs; `/activity` readable.
- **Driver** (`driver@demo-cabs.io`): identical FE gating to viewer (same
  `canWrite`); `/bookings` read-only with no row menus and no New booking.
- **Export nuance (documented, intentional):** `GET /bookings/export.csv`
  uses `get_auth_context` only, so any authenticated role can export the
  bookings CSV (viewer and driver both saw the button and it returned 200).
- No team-invite UI exists; the users quota is API-only, and there is no
  DELETE /users endpoint (only PATCH), so quota-probe users can only be
  deactivated.

### Zenith paywall (API + UI)
- `/auth/me` → `features {reports: false, api_access: false,
  custom_domain: false, max_cabs: 5, max_users: 3}` (EUR, Europe/Paris).
- `GET /reports/summary` → 403 `feature_disabled` "Reports are not enabled
  on your plan."; `PATCH /settings` with `custom_domain` → 403 "Custom
  domains are not enabled on your plan." (both `detail {code, message}`).
- UI: no Reports nav entry; direct `/reports` shows the upsell page
  ("Reports are a Pro feature…"); dashboard revenue card reads "available on
  the Pro plan" and the chart slot shows the Pro note; settings domain card
  is a locked info card; plan card "free plan · up to 5 cabs · 3 users".

### Quotas (boundary-tested)
- Users: 3rd create 201; 4th → 403 `{"code":"quota_exceeded","message":
  "User limit (3) reached for your plan."}`.
- Cabs: 5th create "Cab added" (1–5 of 5); 6th → 403 `"Cab limit (5)
  reached for your plan."`.
- Probe rows were removed afterwards (ZEN-500 deleted via UI, quota-probe
  user deactivated); the final `seed_demo --reset` restored pristine state.

### Branding by host + isolation
- `Host: demo.cabdesk.test` → demo brand (row in `tenant_domains`);
  unknown domain → "Unknown domain"; `?slug=zenith-cabs` → Zenith Rides,
  EUR, blue/orange brand.
- Zenith search for a demo-only customer ("Georges") → zero hits; a zenith
  customer ("Chloe") → 3 bookings + 1 customer. Zenith activity feed shows
  only zenith events, including the probe actions ("Zara Mansour added a
  cab · ZEN-500", "removed a cab", "invited a team member").

### Findings fixed in this pass (verified after rebuild)
1. **Structured 403 detail rendered generically.** `extractDetail`
   (`frontend/src/lib/session.ts`) handled string and FastAPI-validation
   array `detail`, but not `{code, message}` objects → quota/paywall errors
   showed "Request failed (403)". Now unwraps `detail.message`; live-verified
   (6th cab → "Cab limit (5) reached for your plan.").
2. **Dashboard "New booking" CTA for non-writers.** Header CTA and empty-
   state CTA are now gated by `canWrite`; viewer/driver no longer see the
   dead-end link (owner unchanged). Verified in both roles.
3. **Dashboard report fetch for non-writers.** The 30-day summary fetch
   (and all report-backed render branches) now require owner/admin/manager;
   viewer/driver no longer issue the request (no 403 console), the Bookings
   card stays consistent ("Bookings" / all time) and the Revenue card reads
   "available to owners, admins and managers" instead of "no completed
   bookings yet". Owner dashboard unchanged (88 / $3,603.86 / chart).
4. **`custom_domain` missing from GET /settings.** `SettingsOut` now
   includes it (sourced from `tenant_domains`); the Domain field prefills
   "demo.cabdesk.test" for the demo owner and stays empty for zenith.

### Findings documented, not fixed
5. Customer search is case-insensitive but not accent-insensitive
   ("jose" does not match "José"); ILIKE without the `unaccent` extension.
6. One seeded sign-out activity row reads "Sami Khoury signed out ·
   Demo Owner" (label/actor mismatch in seed fixture data).
7. Custom range on /reports keeps the last preset tab styled `[selected]`
   (cosmetic).
8. `customer.created` audit meta stores only the name, unlike
   `customer.updated` (full payload) — minor asymmetry.

Post-fix checks: backend `pytest` 22/22; frontend `tsc --noEmit` clean;
`docker compose build api web` + up, then final `seed_demo --reset`;
post-reset sanity: 2 tenants (stray `acme-cabs` test tenant from an earlier
compose round cascade-deleted), demo 229 bookings / 15 cabs / 13 drivers /
27 customers, zenith 13 bookings / 4 cabs / 4 drivers / 5 customers, no
probe rows (quota user, ZEN-500); login 200, host-header + slug branding 200.
