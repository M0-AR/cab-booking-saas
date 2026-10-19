# CabDesk — Cab Booking Management SaaS

**The calm command center for your cab fleet: bookings, dispatch, drivers, customers, and revenue reports — one clean dashboard, multi‑tenant from day one, deployed with a single command.**

[![License: MIT](https://img.shields.io/badge/license-MIT-2dd4bf?style=flat-square)](LICENSE)
[![Build: passing](https://img.shields.io/badge/build-passing-2dd4bf?style=flat-square)](#testing--verification)
[![PRs: welcome](https://img.shields.io/badge/PRs-welcome-2dd4bf?style=flat-square)](#contributing)

![CabDesk product tour — dashboard, fleet and reports](docs/assets/gifs/product-tour.gif)

---

## The 30‑second summary

Running a cab company on a shared spreadsheet and WhatsApp group works — until it doesn't. A ride gets booked twice. Nobody knows which driver is free. End‑of‑month, the revenue numbers are a guess.

**CabDesk is the software you would write for your own cab company:** every booking captured in one place, dispatch in two clicks, drivers and cabs with live statuses, and reports you can actually trust. It was built the way commercial SaaS is built — real authentication, database‑level tenant isolation, automated tests, and a modern web app that installs on a phone — and it ships as a single command (`make up`).

Out of the box it is **multi‑tenant**: one deployment serves many cab companies ("workspaces"), each with its own data, its own staff, its own branding, and its own plan limits. That means you can use it for one fleet — or run it as a platform and sell it to a hundred.

> **Try it in 60 seconds** — no account needed: jump to [Quick start](#quick-start), run four commands, and sign in with the demo workspace.

## Why teams choose CabDesk

| | |
|---|---|
| **One dashboard, zero chaos** | Every booking, cab, driver, and customer in a single command center — no more double bookings or lost requests. |
| **Dispatch in two clicks** | Pick a booking, assign the best driver and cab, done. The system enforces sensible statuses so the data can never drift. |
| **Numbers you can trust** | Revenue, daily trends, and top‑driver reports are computed from the same data dispatchers work with — not retyped at month end. |
| **Ready to resell** | True multi‑tenant isolation (enforced by the database itself) and per‑tenant plans mean you can onboard the next cab company in minutes. |
| **Looks like money** | White‑label branding, dark mode, a command palette, and a mobile experience that installs like a native app. |
| **Boring to run** | One `docker compose` stack, automatic HTTPS in production, health checks on everything, and a one‑page backup command. |

## What's inside

| Feature | What it does |
|---|---|
| **Bookings** | Create trips with customer, pickup, drop‑off and schedule. Assign driver + cab, complete with a fare, or cancel — with server‑enforced status transitions. Search, filter, paginate, export. |
| **Dispatch** | The Assign flow puts a driver and cab on a booking in two clicks; availability updates everywhere instantly. |
| **Fleet (cabs)** | Full CRUD with plate, model, and live status: available, busy, maintenance. |
| **Drivers** | Driver records with statuses (active / on trip / inactive), plus document tracking — license, insurance, registration, and expiry warnings on the dashboard. |
| **Customers** | Customer directory with search, so repeat riders are booked in seconds. |
| **Reports** | Revenue totals, a 30‑day trend chart, and a top‑drivers leaderboard. Plan‑gated: workspaces without the feature see a friendly upgrade notice. |
| **Dashboard** | Welcome view with the numbers that matter: 30‑day bookings and revenue, plus an attention queue for unassigned bookings, overdue trips, and expiring documents. |
| **Activity log** | An audit trail of what happened, who did it, and when — logins, bookings, fleet changes, settings updates. |
| **Roles & permissions** | Five roles (owner, admin, manager, viewer, driver) with read/write separation enforced on the server, not just hidden in the UI. |
| **Plans & quotas** | Per‑workspace feature flags and limits — max cabs, max users, reports, API access, custom domains — enforced server‑side with clear messages. |
| **White‑label branding** | Each workspace sets its name, logo, and colors; the app repaints itself at runtime. Validation on the way in and on the way out — colors are treated as data, never injected as CSS. |
| **Multi‑tenant by design** | One deployment, many workspaces. Postgres row‑level security scopes every tenant table; a missing tenant context returns zero rows, never someone else's. |
| **Mobile + PWA** | Installable on iOS and Android from the browser; responsive layouts with a bottom navigation bar on phones. |
| **Dark mode & command palette** | A polished dark theme, and `Ctrl/⌘ + K` opens a command palette for instant navigation. |
| **CSV export** | Download bookings as CSV for accounting — available to any signed‑in team member. |
| **One‑command deploy** | `make up` builds and starts the whole stack: database, cache, API, web app, and HTTPS edge. |

## See it in action

The full booking lifecycle — create, assign, complete:

![Booking lifecycle — create a booking, assign a driver and cab, complete the trip](docs/assets/gifs/booking-flow.gif)

| Dashboard (light) | Bookings | Reports |
|---|---|---|
| ![Dashboard](docs/assets/screenshots/03-dashboard-light.png) | ![Bookings](docs/assets/screenshots/04-bookings.png) | ![Reports](docs/assets/screenshots/09-reports.png) |

| Dashboard (dark) | Command palette | Mobile |
|---|---|---|
| ![Dark dashboard](docs/assets/screenshots/12-dashboard-dark.png) | ![Command palette](docs/assets/screenshots/13-command-palette.png) | ![Mobile dashboard](docs/assets/screenshots/14-mobile-dashboard.png) |

<details>
<summary><strong>See all 18 screenshots — every screen, both themes, two workspaces</strong></summary>

| | |
|---|---|
| ![Login](docs/assets/screenshots/01-login.png) | ![Create workspace](docs/assets/screenshots/02-signup.png) |
| ![Cabs](docs/assets/screenshots/06-cabs.png) | ![Drivers](docs/assets/screenshots/07-drivers.png) |
| ![Customers](docs/assets/screenshots/08-customers.png) | ![Activity log](docs/assets/screenshots/10-activity.png) |
| ![Settings](docs/assets/screenshots/11-settings.png) | ![New booking](docs/assets/screenshots/05-booking-modal.png) |
| ![Mobile bookings](docs/assets/screenshots/15-mobile-bookings.png) | ![Second workspace](docs/assets/screenshots/16-zenith-dashboard.png) |
| ![Plan‑gated reports](docs/assets/screenshots/17-zenith-reports-paywall.png) | ![Second workspace settings](docs/assets/screenshots/18-zenith-settings.png) |

</details>

## Quick start

Four commands, one coffee break:

```bash
git clone https://github.com/your-org/cab-booking-saas.git
cd cab-booking-saas
make up      # creates .env with fresh secrets, builds, and starts everything
make seed    # optional: load the demo workspace shown in the screenshots
```

Open **http://localhost:8080** (or http://localhost after setting `SITE_ADDRESS=:80` in `.env`) and sign in:

| Field | Value |
|---|---|
| Workspace | `demo-cabs` |
| Email | `owner@demo-cabs.io` |
| Password | `DemoPass123!` |

Prefer your own workspace? Use the signup page — it creates a fresh tenant with you as owner.

The demo ships with every role, all using the same password (`DemoPass123!`):
`owner@`, `admin@`, `manager@`, `viewer@` and `driver@demo-cabs.io`. A second workspace (`zenith-cabs`, `zara@zenith-cabs.io` / `ZenithPass123!`) demonstrates what a smaller plan looks like — including the upgrade notice where reports would be.

## Who it's for — user stories

**Layla runs a 15‑cab fleet.** She opens CabDesk with her morning coffee. The dashboard shows yesterday's revenue, today's bookings, and an attention card: two documents expire this month and one booking from last night is still unassigned. She assigns it, messages the driver, and gets on with her day.

**Omar is the dispatcher.** A regular calls for an airport run. Omar clicks **New booking**, types three letters, picks the customer, sets pickup and drop‑off, and saves. Fifteen seconds. When the morning rush hits, he works the booking list — filter by *pending*, assign the nearest free driver and cab in two clicks each. Statuses update for everyone in real time.

**Nadia handles the books.** At month end, instead of chasing Omar for a spreadsheet, she opens Reports and reads revenue by day and top drivers. Anything she needs to double‑check, she exports to CSV and reconciles in her accounting tool. Her login is a **viewer** account — she can see everything she needs and change nothing.

**Karim drives one of the cabs.** He has his own driver account — a deliberately minimal view of the system, so nobody has to lend him the owner's login.

**You, as a platform operator.** Maybe you don't own cabs at all: you run CabDesk for several cab companies. Each one signs up and lands in an isolated workspace with its own staff, branding, and plan. The database itself enforces that no workspace can ever see another's data.

## Everything, in depth

<details>
<summary><strong>Bookings & dispatch — the full lifecycle</strong></summary>

A booking moves through a server‑enforced lifecycle: **pending → assigned → completed**, or **cancelled** from a pending/assigned state. The API rejects impossible transitions, so the data can't drift no matter what the UI does.

- **Create** — customer, pickup, drop‑off, and a scheduled time. The customer picker searches by name and phone.
- **Assign** — choose a driver (required) and a cab (optional). Assigning updates driver and cab statuses — no orphaned "busy" vehicles.
- **Complete** — record the fare; the cab and driver are freed automatically.
- **Cancel** — with a reason, for the audit trail.

The list view supports search, status filters, pagination, and one‑click CSV export of exactly what you're looking at.
</details>

<details>
<summary><strong>Fleet & people — cabs, drivers, customers</strong></summary>

- **Cabs** have a plate, a model, and a status (**available / busy / maintenance**). Maintenance cabs can't be assigned — the server refuses.
- **Drivers** have statuses (**active / on trip / inactive**) and tracked documents: license, insurance, and registration with expiry dates. Expiring documents surface on the dashboard before they become a problem.
- **Customers** are a searchable directory — name, phone, and history — so repeat bookings take seconds.
</details>

<details>
<summary><strong>Reports, plans & quotas — a real entitlement system</strong></summary>

Reports show revenue, a 30‑day daily trend, and a top‑drivers leaderboard. But whether you see them depends on two things, exactly like commercial SaaS:

1. **Your role** — viewers see reports only if their team's plan includes them for everyone; writing roles control fleet data.
2. **Your plan** — each workspace has feature flags: `reports`, `max_cabs`, `max_users`, `api_access`, `custom_domain`.

The demo workspace includes everything. The second demo workspace (`zenith-cabs`) shows the flip side: a smaller plan where reports render an **upgrade notice**, adding a sixth cab politely refuses with *"Cab limit (5) reached for your plan."*, and custom domains are unavailable. All of it is enforced by the API — the UI merely reflects it.
</details>

<details>
<summary><strong>Multi‑tenancy & white‑label branding</strong></summary>

**One deployment, many independent cab companies.** Workspaces are separate tenants with separate users, fleets, and settings. Isolation is not a filter someone remembered to add in the code — it's enforced by Postgres itself (see Security below).

Branding is per‑tenant and live: name, logo, and colors apply at runtime. The same deployment therefore looks like *Demo Cabs* for one customer and *Zenith Cabs* for the next. Workspace links work by subdomain or by a `?slug=` parameter, and every color is validated as a strict hex value on write **and** re‑validated in the browser before being applied — so branding can never become a script injection.
</details>

<details>
<summary><strong>Roles & permissions</strong></summary>

Five roles, enforced server‑side on every request:

| Capability | Owner | Admin | Manager | Viewer | Driver |
|---|:---:|:---:|:---:|:---:|:---:|
| View bookings, fleet, customers | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create / edit bookings, cabs, drivers, customers | ✅ | ✅ | ✅ | — | — |
| Assign & complete trips | ✅ | ✅ | ✅ | — | — |
| Reports *(plan‑gated)* | ✅ | ✅ | ✅ | — | — |
| Export CSV | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage workspace settings & team | ✅ | ✅ | — | — | — |

Hiding a button is not security; every one of these rules is checked again in the API on each request.
</details>

<details>
<summary><strong>Security — what's actually protecting your data</strong></summary>

- **Database‑enforced tenant isolation.** Every tenant table has Postgres row‑level security **forced** — even the application user cannot read across tenants. Each request runs with a transaction‑local tenant setting; if it's missing, queries return **zero rows** (fail‑closed, never fail‑open). Cross‑tenant tampering attempts are covered by tests.
- **Honest tokens.** Passwords are hashed with bcrypt. Access tokens are short‑lived JWTs (20 minutes). Refresh tokens are stored **hashed**, rotated on every use, and if an old one is ever replayed the entire token family is revoked — automatic theft detection.
- **Login rate limiting** per workspace + IP, so brute‑force attempts hit a wall.
- **Validated inputs everywhere**, including the branding colors described above.
- **A restricted app role.** The API connects as `app_user`, which is deliberately *not* the database owner. Migrations run with separate credentials.
</details>

<details>
<summary><strong>Architecture — how the pieces fit</strong></summary>

```
              ┌──────────┐
  :80/:443 ──►│  Caddy   │──► /api/* ──► FastAPI (gunicorn + uvicorn workers)
              │  (TLS)   │──► /*      ──► Next.js 15 (standalone)
              └──────────┘
                   │                │
                   │                ├── Postgres 18 — RLS enforced, non-owner app role
                   │                └── Redis — login rate limiting
                   └── every request carries a JWT → tenant_id database setting
```

- **Frontend** — Next.js 15 (App Router), TypeScript, Tailwind v4. The browser talks only to the same origin; a thin server‑side proxy forwards `/api/*` to the backend, so there is no CORS surface and no hard‑coded API URLs.
- **Backend** — FastAPI with SQLAlchemy 2.0 (async). One transaction per request, and every query automatically scoped by the tenant setting that RLS enforces.
- **Database** — Alembic migrations create the roles, force row‑level security on tenant tables, and install two audited security‑definer helpers for the pre‑login flow — so even the login page never needs broad table access.
- **Edge** — Caddy terminates TLS (automatic certificates in production) and routes API vs. web traffic.
</details>

<details>
<summary><strong>Activity log, dark mode, command palette & mobile</strong></summary>

- **Activity** — a human‑readable audit trail: logins, booking created/assigned/completed/cancelled, fleet and settings changes — with actor and timestamp.
- **Dark mode** — a first‑class theme (see the screenshots), not an afterthought.
- **Command palette** — `Ctrl/⌘ + K` from anywhere: jump to any page, create a booking, toggle the theme, without touching the mouse.
- **Mobile & PWA** — fully responsive, and installable: "Add to Home Screen" gives a standalone app shell with its own icon. Phones get a bottom tab bar (Dashboard, Bookings, Cabs, Drivers, More).
</details>

## 🌱 Beginner guide — Read this and you are a professional

<details>
<summary><strong>New to any of this? Open this. You will know more than most interview candidates.</strong></summary>

This project touches nearly every concept in modern web engineering. Here is what each one means — in one breath each — and exactly where to look in this repo to see it.

**The big picture.** CabDesk is a *SaaS* (Software as a Service): software that many companies use at the same time, over the internet, instead of installing it on their own computers. It's *multi‑tenant*: one running copy serves many customers ("tenants" or "workspaces"), and it's built so hard the tenants can't see each other's data.

**The stack, bottom to top:**

- **Docker** packages each piece of the system (database, cache, API, web app, edge) into *containers* — sealed boxes with everything they need inside. That's why the whole platform starts with one command instead of a weekend of installations.
- **Docker Compose** is the conductor: one file (`docker-compose.yml`) that declares all the containers, how they connect, and their health checks.
- **Postgres** is the database — where all bookings, cabs, drivers, and customers live. It's relational: data lives in tables with relationships (a booking *belongs to* a customer).
- **Redis** is a tiny, lightning‑fast in‑memory store. Here it counts login attempts to enforce rate limiting.
- **FastAPI** is the backend framework (Python). It exposes the *API* — the set of URLs like `/api/bookings` that the frontend calls. *Backend* = the part on the server that holds the rules and data.
- **SQLAlchemy** is the tool that lets Python talk to Postgres safely with real code (models) instead of string‑glued SQL.
- **Alembic** manages *migrations*: numbered, versioned changes to the database structure, so the database schema evolves in a controlled way instead of being edited by hand.
- **Next.js** is the frontend framework (React + TypeScript) that renders the screens you click. *Frontend* = what runs in the browser.
- **TypeScript** is JavaScript with types — it catches a whole category of bugs before the code ever runs.
- **Tailwind** is how the app is styled — utility classes instead of hand‑written CSS files.
- **Caddy** is the *reverse proxy*: the front door. It receives all traffic at port 80/443, decides what's a page vs. an API call, and in production obtains and renews HTTPS certificates for you, automatically.

**The words on the security page, unpacked:**

- **Authentication** = proving who you are (login). **Authorization** = what you're allowed to do once you're in (roles).
- **Password hashing (bcrypt)**: passwords are never stored, even encrypted — only a one‑way *hash*. If the database leaked, no password is recoverable.
- **JWT (JSON Web Token)**: a signed pass the server gives you at login. Every request presents it; the signature proves it wasn't forged. *Access tokens* are short‑lived on purpose.
- **Refresh tokens & rotation**: a longer‑lived key to get new passes. It's stored hashed, changes every single use, and if an old one ever appears again, the system assumes theft and revokes everything. This pattern is how serious companies do sessions.
- **Row‑Level Security (RLS)**: the killer feature. Postgres itself attaches the rule "you may only see rows belonging to your tenant" to the *table*, not to the query. Even a careless future query can't leak another company's data. **Fail‑closed** means: if in doubt, return nothing — never everything.
- **Rate limiting**: counting attempts per IP/workspace so a script can't try a million passwords.

**Operational vocabulary:**

- **Migrations** — the version control of database structure. `make up` applies them automatically.
- **Seeding** — filling a fresh database with realistic demo data (`make seed`) so the product can be explored immediately.
- **Environment variables** — configuration kept outside the code (passwords, secrets, domains) in a `.env` file. Secrets get *generated* by `make init`, never committed to the repo.
- **Health checks** — each container periodically proves it's alive; Compose won't declare startup complete until everything is genuinely ready.
- **Tests** — automated checks that the rules hold (22 of them here), including deliberately nasty ones: "can tenant A sneak a row into tenant B?" (it can't).
- **PWA (Progressive Web App)** — a website that can be installed on a phone like an app, complete with icon and offline‑aware shell.
- **Feature flags / entitlements** — per‑customer switches (does this plan include reports?) enforced by the server. This is how SaaS pricing works under the hood.

Read this far, and you genuinely understand how a commercial web product is put together — from the browser pixel to the database row.

</details>

## Deploy to a cloud VM

Any small Linux VM works (1 GB of RAM is plenty for a starter fleet).

1. Install Docker and Compose on the server.
2. Clone this repo and run `make init` (generates `.env` with strong secrets).
3. Set `SITE_ADDRESS=bookings.yourdomain.com` in `.env` and point an A/AAAA record for that host at the server.
4. Run `make up` — Caddy fetches and renews the TLS certificate automatically.
5. Optional: `make seed` for the demo workspace, or sign up your real workspace at `/signup`.

**Backups** are one command:

```bash
docker compose exec db pg_dump -U postgres cab_booking > backup.sql
```

## Environment variables

All configuration lives in `.env` (see `.env.example`; `make init` fills the secrets in for you):

| Variable | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | Database superuser password — used only by migrations |
| `APP_DB_PASSWORD` | Password for the restricted `app_user` role the API runs as |
| `JWT_SECRET` | Signing key for access tokens — changing it logs everyone out |
| `SITE_ADDRESS` | `:8080` locally; your domain in production (automatic HTTPS). Use `:80` for plain HTTP on port 80 |
| `PLATFORM_BASE_DOMAIN` | Base domain used to build workspace links |
| `CORS_ORIGINS` | Only needed if you call the API from another origin |
| `WEB_CONCURRENCY` | API worker processes (roughly 2× CPU cores) |

## Local development

Backend (FastAPI):

```bash
cd backend
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
./.venv/bin/pytest -q                  # 22 tests, ephemeral Postgres via testcontainers
MIGRATION_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/postgres \
  ./.venv/bin/alembic upgrade head
./.venv/bin/uvicorn app.main:app --reload
```

Frontend (Next.js):

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000, proxies /api to localhost:8000
```

## Testing & verification

- **Backend:** `make test` — 22 tests covering tenant isolation (including cross‑tenant write attempts), token rotation and theft detection, entitlement enforcement, and branding validation.
- **Frontend:** `npm run build` with strict TypeScript; the production image is health‑checked on startup.

## FAQ

**Do I need to know Postgres or Docker to use this?** No. If you can run four commands in a terminal, you can run CabDesk. Everything else is configuration in one file.

**Can I white‑label it for my own customers?** Yes — that's the point. Each workspace sets its own name, logo, and colors, and tenants are hard‑isolated at the database level. Several cab companies can share one deployment safely.

**What happens when a workspace hits its plan limits?** The server refuses politely and the UI explains exactly what happened — *"Cab limit (5) reached for your plan."* — instead of failing silently or corrupting data.

**Is there an API?** Yes: the entire product runs on a REST API under `/api/v1`. Plan flags can enable or disable programmatic access per workspace.

**Where's the mobile app?** There isn't one — there doesn't need to be one. The web app is a PWA: open it in a phone browser and "Add to Home Screen" installs it with a proper icon and full‑screen window.

**Can I sell this as part of my own offering?** Yes — it's MIT‑licensed. See below.

## Repository layout

```
├── backend/            FastAPI app, Alembic migrations, tests, seed script
├── frontend/           Next.js app (App Router, TypeScript, Tailwind v4)
├── docs/               Interactive product tour + technical documentation
├── docker-compose.yml  The whole platform, five services, one command
├── Caddyfile           Edge routing & TLS
├── Makefile            init / up / seed / test / reset
└── .env.example        Every setting, documented
```

An interactive tour with a beginner quiz and built‑in calculators lives in [`docs/index.html`](docs/index.html).

## Contributing

Issues and pull requests are welcome. If you're adding a feature, a test that proves it is part of the feature; if you're fixing one, a test that would have caught it is part of the fix.

## License

MIT — see [LICENSE](LICENSE). Use it, modify it, ship it, sell it.
