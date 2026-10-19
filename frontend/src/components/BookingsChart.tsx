"use client";

import { fmtMoney } from "@/lib/format";
import type { DailyPoint } from "@/lib/types";

function niceMax(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const residual = value / magnitude;
  const step = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return step * magnitude;
}

export function fillDaily(
  daily: DailyPoint[],
  start: string,
  end: string,
): DailyPoint[] {
  const byDay = new Map(daily.map((point) => [point.day, point]));
  const series: DailyPoint[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor.getTime() <= last.getTime()) {
    const day = cursor.toISOString().slice(0, 10);
    series.push(byDay.get(day) ?? { day, bookings: 0, revenue: "0" });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return series;
}

export function BookingsChart({
  daily,
  currency,
  start,
  end,
}: {
  daily: DailyPoint[];
  currency: string;
  start: string;
  end: string;
}) {
  const series = fillDaily(daily, start, end);
  if (series.length === 0) return null;

  const peak = Math.max(...series.map((point) => point.bookings), 1);
  const max = niceMax(peak);
  const gridlines = [max, Math.round(max / 2), 0];
  const labelEvery = Math.ceil(series.length / 8);
  const total = series.reduce((sum, point) => sum + point.bookings, 0);
  const first = series[0];
  const last = series[series.length - 1];
  const peakDay = series.reduce((best, point) =>
    point.bookings > best.bookings ? point : best,
  );

  if (total === 0) {
    return (
      <figure>
        <div className="flex h-44 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-4 text-center">
          <p className="text-sm font-medium">No bookings in this period</p>
          <p className="text-xs text-muted">
            New bookings will appear here as they come in.
          </p>
        </div>
        <p className="sr-only">
          Bar chart of bookings per day from {first.day} to {last.day}: no
          bookings recorded.
        </p>
      </figure>
    );
  }

  return (
    <figure>
      <div className="relative pl-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 h-44 w-full"
        >
          {gridlines.map((value) => (
            <div
              key={value}
              className="absolute left-0 right-0 flex -translate-y-1/2 items-center gap-2"
              style={{ top: `${(1 - value / max) * 100}%` }}
            >
              <span className="w-7 text-right text-[10px] tabular-nums text-muted">
                {value}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
          ))}
        </div>

        <div className="flex h-44 items-end gap-1">
          {series.map((point) => (
            <div
              key={point.day}
              className="group relative flex h-full flex-1 items-end justify-center"
              title={`${point.day}: ${point.bookings} bookings · ${fmtMoney(point.revenue, currency)}`}
            >
              <span className="pointer-events-none absolute -top-1 hidden rounded-md bg-fg px-1.5 py-0.5 text-[10px] font-medium text-bg group-hover:block">
                {point.bookings}
              </span>
              <div
                className="w-full max-w-8 rounded-t-sm bg-brand/70 transition-colors group-hover:bg-brand"
                style={{
                  height: `${(point.bookings / max) * 100}%`,
                }}
              />
            </div>
          ))}
        </div>

        <div className="mt-1.5 flex gap-1">
          {series.map((point, index) => (
            <div
              key={point.day}
              className="flex-1 text-center text-[10px] tabular-nums text-muted"
              aria-hidden={index % labelEvery !== 0}
            >
              {index % labelEvery === 0
                ? new Date(point.day).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                : ""}
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only">
        Bar chart of bookings per day from {first.day} to {last.day}, totalling{" "}
        {total} bookings. Peak of {peakDay.bookings} bookings on {peakDay.day}.
      </p>
    </figure>
  );
}

const STATUS_META: Array<{
  key: string;
  label: string;
  swatch: string;
}> = [
  { key: "pending", label: "Pending", swatch: "bg-warning" },
  { key: "assigned", label: "Assigned", swatch: "bg-info" },
  { key: "completed", label: "Completed", swatch: "bg-success" },
  { key: "cancelled", label: "Cancelled", swatch: "bg-muted/50" },
];

export function StatusDistribution({
  byStatus,
  total,
}: {
  byStatus: Record<string, number>;
  total: number;
}) {
  const segments = STATUS_META.map((meta) => ({
    ...meta,
    count: byStatus[meta.key] ?? 0,
  }));

  return (
    <div>
      <div
        aria-hidden="true"
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        {total > 0 &&
          segments
            .filter((segment) => segment.count > 0)
            .map((segment) => (
              <span
                key={segment.key}
                className={segment.swatch}
                style={{ width: `${(segment.count / total) * 100}%` }}
              />
            ))}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {segments.map((segment) => (
          <li
            key={segment.key}
            className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
          >
            <span className="flex items-center gap-2 text-xs text-muted">
              <span
                className={`h-1.5 w-1.5 rounded-full ${segment.swatch}`}
                aria-hidden="true"
              />
              {segment.label}
            </span>
            <span className="text-xs font-medium tabular-nums">
              {segment.count}
              <span className="ml-1 font-normal text-muted">
                {total > 0
                  ? `· ${Math.round((segment.count / total) * 100)}%`
                  : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
