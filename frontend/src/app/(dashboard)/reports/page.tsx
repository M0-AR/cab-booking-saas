"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useMe } from "@/components/auth-context";
import { BookingsChart, StatusDistribution } from "@/components/BookingsChart";
import {
  CalendarIcon,
  ChartIcon,
  CheckCircleIcon,
  DollarIcon,
  DownloadIcon,
  RefreshIcon,
  XIcon,
} from "@/components/Icons";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Segmented,
  Skeleton,
  StatCard,
} from "@/components/ui";
import { api, downloadFile } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import type { ReportSummary, SettingsOut } from "@/lib/types";

type Preset = "7" | "30" | "90" | "custom";

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86400_000);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { me } = useMe();
  const reportsEnabled = Boolean(me.features?.reports);

  const [preset, setPreset] = useState<Preset>("30");
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, settings] = await Promise.all([
        api<ReportSummary>(`/reports/summary?date_from=${from}&date_to=${to}`),
        api<SettingsOut>("/settings"),
      ]);
      setSummary(data);
      setCurrency(settings.currency);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load reports.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (reportsEnabled) void load();
    else setLoading(false);
  }, [load, reportsEnabled]);

  function applyPreset(next: Preset) {
    setPreset(next);
    if (next !== "custom") {
      setFrom(isoDaysAgo(Number(next) - 1));
      setTo(isoDaysAgo(0));
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadFile(
        `/reports/export.csv?date_from=${from}&date_to=${to}`,
        "report.csv",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  if (!reportsEnabled) {
    return (
      <div className="space-y-5">
        <PageHeader title="Reports" />
        <Card>
          <EmptyState
            icon={<ChartIcon size={24} />}
            title="Reports are a Pro feature"
            hint="Upgrade your plan to unlock revenue summaries, daily trends and top-driver rankings."
          />
        </Card>
      </div>
    );
  }

  const daily = summary?.daily ?? [];
  const byStatus = summary?.by_status ?? {};
  const totalBookings = summary?.total_bookings ?? 0;
  const completed = byStatus.completed ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Revenue and trip trends for the selected period."
        actions={
          <>
            <Button
              variant="outline"
              size="md"
              loading={exporting}
              onClick={() => void exportCsv()}
            >
              <DownloadIcon size={16} />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshIcon size={16} />
              Refresh
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Segmented
            ariaLabel="Date range"
            options={
              [
                { value: "7", label: "7 days" },
                { value: "30", label: "30 days" },
                { value: "90", label: "90 days" },
              ] as Array<{ value: Preset; label: string }>
            }
            value={preset === "custom" ? "30" : preset}
            onChange={applyPreset}
          />
          <div className="flex items-end gap-2">
            <Field label="From">
              <Input
                type="date"
                value={from}
                max={to}
                onChange={(e) => {
                  setPreset("custom");
                  setFrom(e.target.value);
                }}
                className="w-40"
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                value={to}
                min={from}
                onChange={(e) => {
                  setPreset("custom");
                  setTo(e.target.value);
                }}
                className="w-40"
              />
            </Field>
          </div>
        </div>
        {preset === "custom" && (
          <p className="mt-3 text-xs text-muted">
            Showing a custom range — pick 7, 30 or 90 days to jump back to a
            preset.
          </p>
        )}
      </Card>

      <ErrorBanner message={error} />

      {loading ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </>
      ) : summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total bookings"
              value={String(totalBookings)}
              sub={`${from} → ${to}`}
              icon={<CalendarIcon size={16} />}
            />
            <StatCard
              label="Revenue"
              value={fmtMoney(summary.revenue, currency)}
              sub={
                summary.avg_fare
                  ? `avg fare ${fmtMoney(summary.avg_fare, currency)}`
                  : "no completed fares yet"
              }
              icon={<DollarIcon size={16} />}
            />
            <StatCard
              label="Completed"
              value={String(completed)}
              sub={
                totalBookings > 0
                  ? `${Math.round((completed / totalBookings) * 100)}% of bookings`
                  : undefined
              }
              icon={<CheckCircleIcon size={16} />}
            />
            <StatCard
              label="Cancelled"
              value={String(byStatus.cancelled ?? 0)}
              sub={
                totalBookings > 0
                  ? `${Math.round(((byStatus.cancelled ?? 0) / totalBookings) * 100)}% of bookings`
                  : undefined
              }
              icon={<XIcon size={16} />}
            />
          </div>

          <Card title="By status">
            {totalBookings === 0 ? (
              <p className="text-sm text-muted">No bookings in this period.</p>
            ) : (
              <StatusDistribution
                byStatus={byStatus}
                total={totalBookings}
              />
            )}
          </Card>

          <Card title="Bookings per day">
            {daily.length === 0 ? (
              <EmptyState title="No bookings in this period" />
            ) : (
              <BookingsChart
                daily={daily}
                currency={currency}
                start={from}
                end={to}
              />
            )}
          </Card>

          <Card title="Top drivers" padded={false}>
            {!summary.top_drivers || summary.top_drivers.length === 0 ? (
              <EmptyState title="No completed trips yet in this period" />
            ) : (
              <ol className="divide-y divide-border">
                {summary.top_drivers.map((driver, index) => (
                  <li
                    key={driver.driver_id}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-brand-ink tabular-nums">
                      {index + 1}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium">
                      {driver.name}
                    </span>
                    <span className="text-sm tabular-nums text-muted">
                      {driver.completed} {driver.completed === 1 ? "trip" : "trips"}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState
            icon={<ChartIcon size={24} />}
            title="No report data"
            hint="Once you complete bookings, trends appear here."
            action={
              <a href="/bookings" className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg">
                Go to bookings
              </a>
            }
          />
        </Card>
      )}
    </div>
  );
}
