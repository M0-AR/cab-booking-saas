"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useMe } from "@/components/auth-context";
import { BookingsChart, fillDaily } from "@/components/BookingsChart";
import {
  CalendarIcon,
  CarIcon,
  DollarIcon,
  UsersIcon,
} from "@/components/Icons";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  Skeleton,
  StatCard,
  buttonClass,
} from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import type {
  AttentionOut,
  Booking,
  Cab,
  CabStatus,
  Customer,
  DailyPoint,
  Driver,
  DriverStatus,
  Page,
  ReportSummary,
  SettingsOut,
} from "@/lib/types";

const CAB_TONES: Array<{ key: CabStatus; label: string; dot: string }> = [
  { key: "available", label: "Available", dot: "bg-success" },
  { key: "busy", label: "Busy", dot: "bg-info" },
  { key: "maintenance", label: "Maintenance", dot: "bg-danger" },
];

const DRIVER_TONES: Array<{ key: DriverStatus; label: string; dot: string }> = [
  { key: "active", label: "Active", dot: "bg-success" },
  { key: "on_trip", label: "On trip", dot: "bg-info" },
  { key: "inactive", label: "Inactive", dot: "bg-muted/50" },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function StatusBar({
  ariaLabel,
  segments,
  total,
}: {
  ariaLabel: string;
  segments: Array<{ key: string; label: string; count: number; dot: string }>;
  total: number;
}) {
  return (
    <div>
      <div
        aria-hidden="true"
        className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2"
      >
        {total > 0 &&
          segments
            .filter((segment) => segment.count > 0)
            .map((segment) => (
              <span
                key={segment.key}
                className={segment.dot}
                style={{ width: `${(segment.count / total) * 100}%` }}
              />
            ))}
      </div>
      <p className="sr-only">
        {ariaLabel}:{" "}
        {segments
          .map((segment) => `${segment.label} ${segment.count}`)
          .join(", ")}
      </p>
      <ul className="mt-3 space-y-1.5">
        {segments.map((segment) => (
          <li
            key={segment.key}
            className="flex items-center justify-between text-xs"
          >
            <span className="flex items-center gap-2 text-muted">
              <span
                className={`h-1.5 w-1.5 rounded-full ${segment.dot}`}
                aria-hidden="true"
              />
              {segment.label}
            </span>
            <span className="font-medium tabular-nums">{segment.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniBars({ points }: { points: DailyPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.bookings));
  return (
    <div aria-hidden="true" className="flex h-7 items-end gap-[3px]">
      {points.map((point) => (
        <span
          key={point.day}
          className="flex-1 rounded-[2px] bg-brand/45"
          style={{
            height:
              point.bookings === 0
                ? "6%"
                : `${Math.max(14, (point.bookings / max) * 100)}%`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Exception-first summary: unassigned and overdue trips plus documents
 * expiring within 30 days. Renders nothing when everything is clear, so it
 * never becomes background noise.
 */
function AttentionPanel({ attention }: { attention: AttentionOut }) {
  const total =
    attention.unassigned_count +
    attention.overdue_count +
    attention.expiring.length;
  if (total === 0) return null;

  const bookingRow = (booking: AttentionOut["unassigned"][number]) => (
    <li key={booking.id}>
      <Link
        href={`/bookings?q=${encodeURIComponent(booking.customer_name)}`}
        className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2/60"
      >
        <span className="min-w-0 truncate">
          <span className="font-medium">{booking.customer_name}</span>{" "}
          <span className="text-muted">
            {booking.pickup} → {booking.dropoff}
          </span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {fmtDateTime(booking.scheduled_at)}
        </span>
      </Link>
    </li>
  );

  const expiryShort = (daysLeft: number) =>
    daysLeft < 0
      ? `expired ${Math.abs(daysLeft)}d`
      : daysLeft === 0
        ? "expires today"
        : `expires ${daysLeft}d`;

  const kindLabel: Record<string, string> = {
    license: "License",
    insurance: "Insurance",
    registration: "Registration",
  };

  return (
    <Card title="Needs attention" padded={false}>
      <div className="divide-y divide-border">
        {attention.unassigned_count > 0 && (
          <section className="px-5 py-3">
            <div className="mb-1.5 flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Unassigned bookings
              </p>
              <Badge tone="pending">{attention.unassigned_count}</Badge>
            </div>
            <ul className="space-y-0.5">
              {attention.unassigned.map(bookingRow)}
            </ul>
          </section>
        )}

        {attention.overdue_count > 0 && (
          <section className="px-5 py-3">
            <div className="mb-1.5 flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Overdue trips
              </p>
              <Badge tone="cancelled">{attention.overdue_count}</Badge>
            </div>
            <ul className="space-y-0.5">
              {attention.overdue.map(bookingRow)}
            </ul>
          </section>
        )}

        {attention.expiring.length > 0 && (
          <section className="px-5 py-3">
            <div className="mb-1.5 flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Expiring documents
              </p>
              <Badge tone="pending">{attention.expiring.length}</Badge>
            </div>
            <ul className="space-y-0.5">
              {attention.expiring.map((item) => {
                const query =
                  item.entity === "driver"
                    ? item.label
                    : (item.label.split("·").pop()?.trim() ?? item.label);
                const href = `/${item.entity === "driver" ? "drivers" : "cabs"}?q=${encodeURIComponent(query)}`;
                return (
                  <li key={`${item.entity}-${item.entity_id}-${item.kind}`}>
                    <Link
                      href={href}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2/60"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{item.label}</span>{" "}
                        <span className="text-muted">
                          · {kindLabel[item.kind] ?? item.kind}
                        </span>
                      </span>
                      <Badge
                        tone={item.days_left < 0 ? "cancelled" : "pending"}
                      >
                        {expiryShort(item.days_left)}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { me } = useMe();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<Page<Booking> | null>(null);
  const [cabs, setCabs] = useState<Page<Cab> | null>(null);
  const [drivers, setDrivers] = useState<Page<Driver> | null>(null);
  const [customers, setCustomers] = useState<Page<Customer> | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [attention, setAttention] = useState<AttentionOut | null>(null);
  const [currency, setCurrency] = useState("USD");

  const reportsEnabled = Boolean(me.features?.reports);
  const canViewReports =
    reportsEnabled &&
    ["owner", "admin", "manager"].includes(me.user.role);
  const canWrite = ["owner", "admin", "manager"].includes(me.user.role);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, c, d, cu, s] = await Promise.all([
          api<Page<Booking>>("/bookings?page=1&page_size=5"),
          api<Page<Cab>>("/cabs?page=1&page_size=100"),
          api<Page<Driver>>("/drivers?page=1&page_size=100"),
          api<Page<Customer>>("/customers?page=1&page_size=1"),
          api<SettingsOut>("/settings"),
        ]);
        if (cancelled) return;
        setBookings(b);
        setCabs(c);
        setDrivers(d);
        setCustomers(cu);
        setCurrency(s.currency);
        try {
          setAttention(await api<AttentionOut>("/dashboard/attention"));
        } catch {
          setAttention(null);
        }
        if (canViewReports) {
          try {
            setSummary(await api<ReportSummary>("/reports/summary"));
          } catch {
            setSummary(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load dashboard.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewReports]);

  const firstName = me.user.full_name.trim().split(/\s+/)[0] ?? "";
  const cabItems = cabs?.items ?? [];
  const driverItems = drivers?.items ?? [];
  const cabSegments = CAB_TONES.map((tone) => ({
    key: tone.key,
    label: tone.label,
    dot: tone.dot,
    count: cabItems.filter((cab) => cab.status === tone.key).length,
  }));
  const driverSegments = DRIVER_TONES.map((tone) => ({
    key: tone.key,
    label: tone.label,
    dot: tone.dot,
    count: driverItems.filter((driver) => driver.status === tone.key).length,
  }));
  const summaryDaily = summary?.daily ?? [];
  const daily =
    canViewReports && summaryDaily.length > 0
      ? fillDaily(summaryDaily, isoDaysAgo(13), isoDaysAgo(0))
      : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Welcome back, {firstName}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Here&apos;s what&apos;s happening at {me.tenant.name} today.
          </p>
        </div>
        {canWrite && (
          <Link href="/bookings?new=1" className={buttonClass("primary", "md")}>
            New booking
          </Link>
        )}
      </div>

      <ErrorBanner message={error} />

      {attention && !loading && <AttentionPanel attention={attention} />}

      {loading ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-64 rounded-xl lg:col-span-2" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={canViewReports ? "Bookings · 30 days" : "Bookings"}
              value={String(summary?.total_bookings ?? bookings?.total ?? 0)}
              sub={
                summary
                  ? `${summary.by_status?.completed ?? 0} completed · ${summary.by_status?.cancelled ?? 0} cancelled`
                  : "all time"
              }
              icon={<CalendarIcon size={16} />}
              chart={daily.length > 0 ? <MiniBars points={daily} /> : undefined}
            />
            <StatCard
              label="Revenue · 30 days"
              value={summary ? fmtMoney(summary.revenue, currency) : "—"}
              sub={
                summary?.avg_fare
                  ? `avg fare ${fmtMoney(summary.avg_fare, currency)}`
                  : canViewReports
                    ? "no completed bookings yet"
                    : reportsEnabled
                      ? "available to owners, admins and managers"
                      : "available on the Pro plan"
              }
              icon={<DollarIcon size={16} />}
            />
            <StatCard
              label="Drivers"
              value={String(drivers?.total ?? 0)}
              sub={`${driverSegments[0].count + driverSegments[1].count} active`}
              icon={<UsersIcon size={16} />}
            />
            <StatCard
              label="Cabs"
              value={String(cabs?.total ?? 0)}
              sub={`${cabSegments[0].count} available`}
              icon={<CarIcon size={16} />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {canViewReports && daily.length > 0 ? (
              <Card
                title="Bookings per day · last 14 days"
                className="lg:col-span-2"
                actions={
                  <Link
                    href="/reports"
                    className="text-xs font-medium text-brand-ink hover:underline"
                  >
                    View report
                  </Link>
                }
              >
                <BookingsChart
                  daily={summaryDaily}
                  currency={currency}
                  start={isoDaysAgo(13)}
                  end={isoDaysAgo(0)}
                />
              </Card>
            ) : (
              <Card title="Customers" className="lg:col-span-2">
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                  <p className="text-2xl font-semibold tabular-nums">
                    {customers?.total ?? 0}
                  </p>
                  <p className="text-sm text-muted">
                    customers in your directory
                  </p>
                  {!reportsEnabled && (
                    <p className="text-xs text-muted">
                      Daily booking charts are available on the Pro plan.
                    </p>
                  )}
                </div>
              </Card>
            )}

            <Card title="Fleet status">
              <div className="space-y-5">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                    Cabs
                  </p>
                  <StatusBar
                    ariaLabel="Cabs by status"
                    segments={cabSegments}
                    total={cabs?.total ?? 0}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                    Drivers
                  </p>
                  <StatusBar
                    ariaLabel="Drivers by status"
                    segments={driverSegments}
                    total={drivers?.total ?? 0}
                  />
                </div>
              </div>
            </Card>
          </div>

          <Card
            title="Recent bookings"
            actions={
              <Link
                href="/bookings"
                className="text-xs font-medium text-brand-ink hover:underline"
              >
                View all
              </Link>
            }
            padded={false}
          >
            {bookings && bookings.items.length > 0 ? (
              <ul className="divide-y divide-border">
                {bookings.items.map((booking) => (
                  <li
                    key={booking.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {booking.customer.name}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {booking.pickup} → {booking.dropoff} ·{" "}
                        {fmtDateTime(booking.scheduled_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {booking.fare && (
                        <span className="hidden text-sm font-medium tabular-nums sm:block">
                          {fmtMoney(booking.fare, currency)}
                        </span>
                      )}
                      <Badge tone={booking.status}>{booking.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<CalendarIcon size={24} />}
                title="No bookings yet"
                hint="Create your first booking and it will show up here."
                action={
                  canWrite ? (
                    <Link href="/bookings?new=1" className={buttonClass()}>
                      New booking
                    </Link>
                  ) : undefined
                }
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
