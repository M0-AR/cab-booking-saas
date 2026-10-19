"use client";

import type { ReactNode } from "react";

import { CarIcon, CheckIcon } from "@/components/Icons";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const HIGHLIGHTS = [
  "Bookings, drivers and cabs in one dashboard",
  "Works on desktop, tablet and phone",
  "Your own branding and workspace",
];

export function AuthShell({
  title,
  subtitle,
  displayName = "CabDesk",
  logoUrl,
  children,
}: {
  title: string;
  subtitle?: string;
  displayName?: string;
  logoUrl?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand p-10 text-brand-fg lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="h-9 w-9 rounded-lg bg-white/10 object-contain p-1"
              />
            ) : (
              <span
                className="grid h-9 w-9 place-items-center rounded-lg bg-white/12"
                aria-hidden="true"
              >
                <CarIcon size={20} />
              </span>
            )}
            <span className="text-base font-semibold tracking-tight">
              {displayName}
            </span>
          </div>
          <h2 className="mt-14 max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Run your cab fleet from one calm dashboard.
          </h2>
          <ul className="mt-8 space-y-3 text-sm text-brand-fg/90">
            {HIGHLIGHTS.map((line) => (
              <li key={line} className="flex items-center gap-2.5">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white/12">
                  <CheckIcon size={12} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-fg/70">
          Live demo: workspace{" "}
          <span className="font-mono font-semibold">demo-cabs</span> ·
          owner@demo-cabs.io / DemoPass123!
        </p>
      </aside>

      <main className="relative flex items-center justify-center bg-bg px-4 py-10 sm:px-8">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="w-full max-w-sm">
          <div className="mb-7 flex items-center gap-2.5 lg:hidden">
            <LogoMark size={34} />
            <span className="text-base font-semibold tracking-tight">
              {displayName}
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
