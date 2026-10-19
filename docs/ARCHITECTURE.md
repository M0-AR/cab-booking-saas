# ARCHITECTURE — Cab Booking SaaS

## System topology

```
                    ┌──────────────┐
   Internet ──────► │    Caddy     │  :80/:443, TLS, reverse proxy
                    └──────┬───────┘
             ┌─────────────┴──────────────┐
             ▼                            ▼
      ┌─────────────┐              ┌─────────────┐
      │  frontend   │              │  backend    │
      │ Next.js 15  │ ── /api ───► │  FastAPI    │
      │ :3000       │              │  :8000      │
      └─────────────┘              └──┬───────┬──┘
                                      ▼       ▼
                                 ┌────────┐ ┌───────┐
                                 │postgres│ │ redis │   (internal network only,
                                 └────────┘ └───────┘    no published ports)
```

Docker networks: `edge` (caddy ↔ frontend/backend) + `backend` (`internal: true`;
backend ↔ postgres/redis).

## Multi-tenancy request flow

1. Client calls `api.example.com` (or tenant custom domain) → Caddy → backend.
2. `TenantMiddleware` resolves tenant:
   a. `X-Tenant-Slug` header (API clients / SPA), or
   b. `Host` subdomain (`acme.api.example.com`), or
   c. JWT `tenant` claim (authenticated requests).
3. Auth dependency verifies JWT (PyJWT, HS256) → `user_id`, `tenant_id`, `role`.
4. DB dependency opens one transaction and executes
   `SELECT set_config('app.current_tenant', :tenant, true)` — **transaction-scoped**
   (third arg `true`), safe under any pooler. Then `SET LOCAL app.current_user`.
5. All ORM queries run inside that transaction; Postgres RLS
   (`USING (tenant_id = current_tenant())`) filters every row.
   `FORCE ROW LEVEL SECURITY` makes even the owner subject.
6. `WITH CHECK` guarantees inserts/updates can never be written cross-tenant.
7. Connection returns to pool after transaction → context cannot leak.

Fail-closed: missing/empty tenant GUC → `current_tenant()` returns NULL →
no rows visible, writes rejected.

## Database schema (all tenant tables carry `tenant_id uuid NOT NULL`)

- `tenants` (id, slug, name, plan, status, created_at) — plus `bypass_tenant_rls`
  policy scoped to the row itself for provisioning endpoints.
- `tenant_settings` (tenant_id PK, currency, timezone, brand JSONB
  {primary, accent, logo_url, domain}, features JSONB, fare JSONB).
- `users` (id, tenant_id, email, password_hash, role enum owner|admin|manager|driver|viewer).
- `drivers` (id, tenant_id, name, phone, license_no, status).
- `cabs` (id, tenant_id, model, plate, capacity, status, driver_id FK→drivers).
- `customers` (id, tenant_id, name, phone, email).
- `bookings` (id, tenant_id, customer_id, driver_id, cab_id, pickup, dropoff,
  scheduled_at, status enum pending|assigned|completed|cancelled, fare, notes).
- `audit_logs` (id, tenant_id, user_id, action, entity, entity_id, meta JSONB, at).

RLS pattern per table:

```sql
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bookings
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
```

(`current_setting(..., true)` returns NULL when unset → default deny.)

## Backend layout (`backend/app/`)

```
main.py            FastAPI app, routers, middleware, /livez /readyz
core/config.py     pydantic-settings (.env)
core/security.py   JWT encode/decode, password hashing (passlib bcrypt)
core/tenancy.py    current_tenant / current_user GUC helpers + middleware
db/session.py      async engine, AsyncSession dep, set_config transaction
db/base.py         DeclarativeBase + TenantMixin
models/            SQLAlchemy models (tenant, user, driver, cab, customer, booking, audit)
schemas/           Pydantic v2 request/response models
api/routers/       public.py (signup/branding/login), cabs, drivers, customers,
                   bookings, reports, settings, users
api/deps.py        get_current_user, require_role
services/          booking logic, reports aggregation
alembic/           migration 0001 (tables + RLS + force + app role grants)
tests/             pytest + testcontainers: auth, CRUD, **cross-tenant isolation**
```

## Frontend layout (`frontend/`)

```
app/layout.tsx            root layout; injects tenant theme <style id="tenant-tokens">
app/manifest.ts           PWA manifest
app/(marketing)/page.tsx  public landing
app/login/page.tsx        auth
app/(dashboard)/          dashboard, cabs, drivers, customers, bookings, reports, settings
components/ui/            shadcn-style primitives (button, card, table, dialog...)
components/theme/         ThemeScript (no-FOUC), ThemeProvider
lib/api.ts                typed fetch client (JWT in memory + refresh)
lib/tenant.ts             slug/host resolution
public/sw.js              service worker (push notifications, offline shell)
```

White-label: `app/layout.tsx` reads tenant branding (from public API by host),
renders `<style id="tenant-tokens">:root{--brand-primary:...}</style>` after
hex-validating every value server-side; Tailwind v4 `@theme inline` tokens
reference `--brand-*` with fallbacks, so components restyle with zero rebuild.

## Security posture

- RLS fail-closed + FORCE + non-owner `app_user` role for runtime.
- JWT: 20-min access, rotating 14-day refresh; `sub` as string; token type claim.
- Argon/bcrypt password hashing; login rate-limited (Redis token bucket).
- Tenant-branding values validated by hex regex before CSS render (CSS-injection).
- CORS allowlist per env; security headers set in `next.config.ts` and Caddy.
- Audit log row for every write action.
