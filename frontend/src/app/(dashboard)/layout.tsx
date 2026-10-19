"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";

import { MeContext } from "@/components/auth-context";
import { CommandPalette, type PaletteItem } from "@/components/command-palette";
import {
  BuildingIcon,
  CalendarIcon,
  CarIcon,
  ChartIcon,
  ClockIcon,
  GaugeIcon,
  LogOutIcon,
  MoreIcon,
  PanelCollapseIcon,
  PanelExpandIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
} from "@/components/Icons";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Kbd, Modal, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { applyBrand, resetBrand } from "@/lib/branding";
import { clearSession, getAccessToken } from "@/lib/session";
import type { MeOut, SearchResults, SettingsOut } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  feature?: "reports";
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <GaugeIcon size={18} /> },
  { href: "/bookings", label: "Bookings", icon: <CalendarIcon size={18} /> },
  { href: "/cabs", label: "Cabs", icon: <CarIcon size={18} /> },
  { href: "/drivers", label: "Drivers", icon: <UsersIcon size={18} /> },
  { href: "/customers", label: "Customers", icon: <BuildingIcon size={18} /> },
  {
    href: "/reports",
    label: "Reports",
    icon: <ChartIcon size={18} />,
    feature: "reports",
  },
  { href: "/activity", label: "Activity", icon: <ClockIcon size={18} /> },
  { href: "/settings", label: "Settings", icon: <SettingsIcon size={18} /> },
];

const MOBILE_NAV = NAV.slice(0, 4);
const COLLAPSE_KEY = "cabdesk.sidebarCollapsed";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ShellSkeleton() {
  return (
    <div className="min-h-dvh bg-bg lg:flex" aria-busy="true">
      <div className="hidden w-[264px] shrink-0 border-r border-border bg-surface p-4 lg:block">
        <div className="skeleton h-9 w-40 rounded-lg" />
        <div className="mt-6 space-y-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="skeleton h-9 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <div className="skeleton h-7 w-44 rounded-lg" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
        <div className="skeleton mt-6 h-72 rounded-xl" />
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  const [me, setMe] = useState<MeOut | null>(null);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = paletteQuery.trim();
    if (!paletteOpen || term.length < 2) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await api<SearchResults>(
          `/search?q=${encodeURIComponent(term)}`,
        );
        if (!cancelled) setSearchResults(results);
      } catch {
        if (!cancelled) setSearchResults(null);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [paletteQuery, paletteOpen]);

  function handlePaletteOpen(open: boolean) {
    setPaletteOpen(open);
    if (!open) {
      setPaletteQuery("");
      setSearchResults(null);
    }
  }

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [profile, settings] = await Promise.all([
          api<MeOut>("/auth/me"),
          api<SettingsOut>("/settings"),
        ]);
        if (cancelled) return;
        applyBrand(settings.brand);
        setBrandName(settings.brand.display_name ?? null);
        setMe(profile);
        setReady(true);
      } catch {
        if (!cancelled) {
          clearSession();
          resetBrand();
          router.replace("/login");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    const onBrand = (event: Event) => {
      const detail = (event as CustomEvent<{ display_name?: string | null }>)
        .detail;
      setBrandName(detail?.display_name ?? null);
    };
    window.addEventListener("cabdesk:brand", onBrand);
    return () => window.removeEventListener("cabdesk:brand", onBrand);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function signOut() {
    clearSession();
    resetBrand();
    router.replace("/login");
  }

  if (!ready || !me) {
    return <ShellSkeleton />;
  }

  const features = me.features ?? {};
  const items = NAV.filter((item) => !item.feature || features[item.feature]);
  const displayName = brandName ?? me.tenant.name;
  const role = me.user.role;
  const userInitials = initials(me.user.full_name);
  const title =
    items.find((item) => isActive(pathname, item.href))?.label ?? "CabDesk";

  // Live entity results from the server, shown above Pages/Actions while
  // the user types. Selecting one deep-links to the list page pre-filtered
  // via ?q= and (when already there) pings the page through a custom event.
  const entityItems: PaletteItem[] = [];
  const term = paletteQuery.trim();
  if (searchResults && term.length >= 2) {
    const openRecord = (base: string) => {
      router.push(`${base}?q=${encodeURIComponent(term)}`);
      window.dispatchEvent(
        new CustomEvent("cabdesk:search", { detail: { q: term } }),
      );
    };
    const groups: Array<{
      key: keyof SearchResults;
      group: string;
      icon: React.ReactNode;
      base: string;
    }> = [
      {
        key: "bookings",
        group: "Bookings",
        icon: <CalendarIcon size={16} />,
        base: "/bookings",
      },
      {
        key: "customers",
        group: "Customers",
        icon: <BuildingIcon size={16} />,
        base: "/customers",
      },
      {
        key: "drivers",
        group: "Drivers",
        icon: <UsersIcon size={16} />,
        base: "/drivers",
      },
      { key: "cabs", group: "Cabs", icon: <CarIcon size={16} />, base: "/cabs" },
    ];
    for (const entry of groups) {
      for (const hit of searchResults[entry.key]) {
        entityItems.push({
          id: `hit-${entry.key}-${hit.id}`,
          label: hit.title,
          group: entry.group,
          icon: entry.icon,
          hint: hit.subtitle ?? undefined,
          badge: hit.badge ?? undefined,
          // The typed term joins the searchable value so cmdk's client-side
          // filter always passes server-ranked results through.
          keywords: `${hit.subtitle ?? ""} ${term}`,
          onSelect: () => openRecord(entry.base),
        });
      }
    }
  }

  const paletteItems: PaletteItem[] = [
    ...entityItems,
    ...items.map((item) => ({
      id: `nav-${item.href}`,
      label: item.label,
      group: "Pages",
      icon: item.icon,
      onSelect: () => router.push(item.href),
    })),
    {
      id: "action-toggle-theme",
      label: "Toggle theme",
      group: "Actions",
      keywords: "dark light appearance",
      onSelect: () =>
        setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    },
    {
      id: "action-sign-out",
      label: "Sign out",
      group: "Actions",
      keywords: "logout leave",
      onSelect: signOut,
    },
  ];

  return (
    <MeContext.Provider value={{ me }}>
      <div className="min-h-dvh bg-bg lg:flex">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 lg:flex",
            collapsed ? "w-[76px]" : "w-[264px]",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2.5 py-4",
              collapsed ? "justify-center px-2" : "px-5",
            )}
          >
            <LogoMark size={34} />
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight">
                  {displayName}
                </p>
                <p className="truncate text-[11px] uppercase tracking-wide text-muted">
                  {me.tenant.plan} plan
                </p>
              </div>
            )}
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg py-2 text-sm transition-colors",
                    collapsed ? "justify-center px-0" : "px-3",
                    active
                      ? "bg-surface-2 font-medium text-fg before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-brand"
                      : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <span className={active ? "text-brand-ink" : undefined}>
                    {item.icon}
                  </span>
                  {!collapsed && item.label}
                </Link>
              );
            })}
          </nav>

          <div
            className={cn(
              "relative border-t border-border p-3",
              collapsed && "px-2",
            )}
            ref={menuRef}
          >
            {menuOpen && (
              <div className="animate-scale-in absolute bottom-full left-3 right-3 mb-1 rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow-overlay)]">
                <div className="border-b border-border px-3 py-2.5">
                  <p className="truncate text-sm font-medium">
                    {me.user.full_name}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {me.user.email} · {role}
                  </p>
                </div>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2"
                >
                  <SettingsIcon size={16} />
                  Settings
                </Link>
                <button
                  onClick={signOut}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger-ink transition-colors hover:bg-surface-2"
                >
                  <LogOutIcon size={16} />
                  Sign out
                </button>
              </div>
            )}
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg py-2 transition-colors hover:bg-surface-2",
                collapsed ? "justify-center px-0" : "px-2",
              )}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand-ink">
                {userInitials}
              </span>
              {!collapsed && (
                <span className="min-w-0 text-left">
                  <span className="block truncate text-sm font-medium">
                    {me.user.full_name}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {role}
                  </span>
                </span>
              )}
            </button>
            <button
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(
                "mt-1 flex w-full items-center gap-2.5 rounded-lg py-2 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg",
                collapsed ? "justify-center px-0" : "px-2",
              )}
            >
              {collapsed ? (
                <PanelExpandIcon size={16} />
              ) : (
                <PanelCollapseIcon size={16} />
              )}
              {!collapsed && "Collapse"}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur-sm">
            <div className="hidden h-14 items-center justify-between gap-4 px-6 lg:flex lg:px-8">
              <h2 className="truncate text-sm font-semibold">{title}</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPaletteOpen(true)}
                  className="flex h-9 w-60 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm text-muted transition-colors hover:bg-surface-2"
                >
                  <SearchIcon size={15} />
                  <span>Search…</span>
                  <Kbd className="ml-auto">⌘K</Kbd>
                </button>
                <ThemeToggle />
              </div>
            </div>

            <div className="flex h-14 items-center justify-between gap-3 px-4 lg:hidden">
              <div className="flex min-w-0 items-center gap-2.5">
                <LogoMark size={30} />
                <p className="truncate text-sm font-semibold">{displayName}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPaletteOpen(true)}
                  aria-label="Search"
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <SearchIcon size={18} />
                </button>
                <button
                  onClick={() => setMoreOpen(true)}
                  aria-label="Account and more"
                  className="grid h-9 w-9 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand-ink"
                >
                  {userInitials}
                </button>
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1">
            <div className="mx-auto max-w-6xl px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-10">
              {children}
            </div>
          </main>
        </div>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface lg:hidden">
          <div className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
            {MOBILE_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                    active ? "text-brand-ink" : "text-muted",
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={() => setMoreOpen(true)}
              className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted transition-colors"
            >
              <MoreIcon size={18} />
              More
            </button>
          </div>
        </nav>

        {/* Mobile "More" sheet */}
        <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu">
          <div className="space-y-1">
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand-ink">
                {userInitials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {me.user.full_name}
                </p>
                <p className="truncate text-xs text-muted">
                  {me.user.email} · {role}
                </p>
              </div>
            </div>
            {items.slice(4).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-surface-2"
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
            <div className="flex min-h-11 items-center justify-between rounded-lg px-3 text-sm">
              <span className="flex items-center gap-3 text-fg">Theme</span>
              <ThemeToggle />
            </div>
            <button
              onClick={signOut}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-danger-ink transition-colors hover:bg-surface-2"
            >
              <LogOutIcon size={18} />
              Sign out
            </button>
          </div>
        </Modal>

        <CommandPalette
          open={paletteOpen}
          onOpenChange={handlePaletteOpen}
          items={paletteItems}
          onQueryChange={setPaletteQuery}
        />
      </div>
    </MeContext.Provider>
  );
}
