import Link from "next/link";

import {
  ArrowRightIcon,
  CalendarIcon,
  CarIcon,
  ChartIcon,
  GaugeIcon,
  MapPinIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/Icons";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#security", label: "Security" },
];

const CAPABILITIES = [
  {
    icon: <CalendarIcon size={18} />,
    title: "Bookings & dispatch",
    body: "Create, assign and track bookings from pending to completed with fare estimates built in.",
  },
  {
    icon: <CarIcon size={18} />,
    title: "Fleet management",
    body: "Keep cabs, plates and availability status in one register your whole team can trust.",
  },
  {
    icon: <UsersIcon size={18} />,
    title: "Drivers & customers",
    body: "Driver contact details, licence info, and a customer directory that stays up to date.",
  },
  {
    icon: <ChartIcon size={18} />,
    title: "Reports",
    body: "Booking volume, revenue and fleet utilisation visualised from your live data.",
  },
  {
    icon: <ShieldIcon size={18} />,
    title: "Roles & access",
    body: "Owners, admins, managers and operators — everyone sees exactly what they should.",
  },
  {
    icon: <GaugeIcon size={18} />,
    title: "Your branding",
    body: "Your workspace name, colors and logo, applied across the app in seconds.",
  },
];

const STEPS = [
  {
    number: "1",
    title: "Create your workspace",
    body: "Sign up and get an isolated tenant with your own brand, roles and settings.",
  },
  {
    number: "2",
    title: "Add fleet, drivers and customers",
    body: "Load your cabs and people once — then keep them current from the dashboard.",
  },
  {
    number: "3",
    title: "Book, assign and track",
    body: "Create bookings, assign a cab and driver, and follow every trip to completion.",
  },
];

const BARS = [42, 58, 47, 70, 62, 84, 74];
const MOCK_ROWS = [
  { from: "Central Station", to: "Airport Terminal 1", status: "completed" },
  { from: "Grand Hotel", to: "Riverside Mall", status: "on trip" },
  { from: "University", to: "Train Station", status: "assigned" },
];

export default function Home() {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-dvh bg-bg">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark size={30} />
            <span className="text-base font-semibold tracking-tight">
              CabDesk
            </span>
          </Link>
          <nav
            aria-label="Main"
            className="hidden items-center gap-1 md:flex"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Link
              href="/login"
              className="hidden h-9 items-center rounded-lg px-3.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-sm font-medium text-brand-fg shadow-xs transition-colors hover:bg-(--brand-hover)"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 lg:px-8 lg:pt-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
              Multi-tenant cab operations
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
              Run your cab fleet from one calm dashboard.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted text-pretty sm:text-lg">
              Bookings, cabs, drivers and customers in one place — with the
              reports and access control a real operation needs.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-medium text-brand-fg shadow-xs transition-colors hover:bg-(--brand-hover)"
              >
                Start free
                <ArrowRightIcon size={16} />
              </Link>
              <Link
                href="/login?tenant=demo-cabs"
                className="inline-flex h-10 items-center rounded-lg border border-border-strong bg-surface px-5 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
              >
                Try the live demo
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted">
              No credit card required · Your own branded workspace in a minute
            </p>
          </div>

          {/* Product preview */}
          <figure id="product" className="mx-auto mt-14 max-w-4xl scroll-mt-24">
            <div
              aria-hidden="true"
              className="pointer-events-none select-none overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
                <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
                <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
                <span className="ml-3 hidden rounded-md bg-surface-2 px-2.5 py-1 text-[10px] text-muted sm:block">
                  app.cabdesk.example/dashboard
                </span>
              </div>
              <div className="flex">
                <div className="hidden w-44 shrink-0 border-r border-border p-3 sm:block">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-brand text-brand-fg">
                      <CarIcon size={13} />
                    </span>
                    <span className="h-2.5 w-20 rounded-full bg-surface-2" />
                  </div>
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5 text-[11px] font-medium text-fg">
                      <GaugeIcon size={13} className="text-brand-ink" />
                      Dashboard
                    </div>
                    {["Bookings", "Cabs", "Drivers", "Reports"].map((label) => (
                      <div
                        key={label}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-muted"
                      >
                        <span className="h-3 w-3 rounded-sm bg-surface-2" />
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="min-w-0 flex-1 p-4 sm:p-5">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      ["Bookings today", "18"],
                      ["Active cabs", "6"],
                      ["Revenue", "$1,240"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-border p-3"
                      >
                        <p className="truncate text-[10px] text-muted">{label}</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex h-24 items-end gap-2 rounded-xl border border-border p-3">
                    {BARS.map((height, index) => (
                      <span
                        key={index}
                        style={{ height: `${height}%` }}
                        className={
                          index === 5
                            ? "flex-1 rounded-t-sm bg-brand"
                            : "flex-1 rounded-t-sm bg-brand/25"
                        }
                      />
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    {MOCK_ROWS.map((row) => (
                      <div
                        key={row.from}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted">
                          <MapPinIcon size={12} />
                          <span className="truncate">
                            {row.from} → {row.to}
                          </span>
                        </div>
                        <span
                          className={
                            row.status === "completed"
                              ? "rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[10px] text-success-ink"
                              : row.status === "on trip"
                                ? "rounded-full border border-info/25 bg-info/10 px-2 py-0.5 text-[10px] text-info-ink"
                                : "rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-[10px] text-warning-ink"
                          }
                        >
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <figcaption className="mt-3 text-center text-xs text-muted">
              Product preview — sample data
            </figcaption>
          </figure>
        </section>

        {/* Capabilities */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Everything a cab operation runs on
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-muted">
            Built for the day-to-day work: dispatch, fleet upkeep, people and
            the numbers behind them.
          </p>
          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((capability) => (
              <div key={capability.title} className="flex gap-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand-ink">
                  {capability.icon}
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{capability.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {capability.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="scroll-mt-20 border-y border-border bg-surface"
        >
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              Up and running in minutes
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              {STEPS.map((step) => (
                <div key={step.number}>
                  <span className="grid h-8 w-8 place-items-center rounded-full border border-border bg-bg text-sm font-semibold text-brand-ink tabular-nums">
                    {step.number}
                  </span>
                  <h3 className="mt-4 text-sm font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
            <div className="rounded-2xl border border-border bg-surface p-8 sm:p-12">
              <div className="mx-auto max-w-2xl text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand-ink">
                  <ShieldIcon size={22} />
                </span>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Your data stays yours
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  Every workspace is an isolated tenant. Postgres row-level
                  security is enforced on every query, so one company&apos;s
                  bookings, customers and drivers are never visible to another.
                </p>
              </div>
              <div className="mx-auto mt-10 grid max-w-3xl gap-6 sm:grid-cols-3">
                {[
                  [
                    "Row-level security",
                    "Tenant isolation enforced in the database, not just the app.",
                  ],
                  [
                    "Role-based access",
                    "Owners, admins, managers and operators with scoped permissions.",
                  ],
                  [
                    "Token-scoped requests",
                    "Every API call is bound to a signed, expiring session.",
                  ],
                ].map(([title, body]) => (
                  <div key={title}>
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                      {body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 lg:px-8">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Ready to move your fleet to CabDesk?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted">
              Create your workspace, add your cabs and drivers, and take your
              first booking today.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-medium text-brand-fg shadow-xs transition-colors hover:bg-(--brand-hover)"
              >
                Start free
                <ArrowRightIcon size={16} />
              </Link>
              <Link
                href="/login?tenant=demo-cabs"
                className="inline-flex h-10 items-center rounded-lg border border-border-strong bg-surface px-5 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
              >
                Explore the demo
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-bg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="text-sm font-semibold tracking-tight">
              CabDesk
            </span>
          </div>
          <nav aria-label="Footer" className="flex items-center gap-5">
            <Link
              href="/login"
              className="text-xs text-muted transition-colors hover:text-fg"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-xs text-muted transition-colors hover:text-fg"
            >
              Create workspace
            </Link>
          </nav>
          <p className="text-xs text-muted">© {year} CabDesk</p>
        </div>
      </footer>
    </div>
  );
}
