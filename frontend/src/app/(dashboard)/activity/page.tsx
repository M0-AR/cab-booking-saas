"use client";

import { useCallback, useEffect, useState } from "react";

import {
  BuildingIcon,
  CalendarIcon,
  CarIcon,
  InboxIcon,
  InfoIcon,
  RefreshIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon,
} from "@/components/Icons";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Segmented,
  Skeleton,
} from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { ActivityItem, Page } from "@/lib/types";

const PAGE_SIZE = 30;

const ENTITIES = ["all", "booking", "driver", "cab", "customer", "user", "settings"] as const;
type EntityFilter = (typeof ENTITIES)[number];

const ACTION_LABELS: Record<string, string> = {
  "booking.created": "created a booking",
  "booking.assigned": "assigned a booking",
  "booking.completed": "completed a booking",
  "booking.cancelled": "cancelled a booking",
  "driver.created": "added a driver",
  "driver.updated": "updated a driver",
  "driver.deleted": "removed a driver",
  "cab.created": "added a cab",
  "cab.updated": "updated a cab",
  "cab.deleted": "removed a cab",
  "customer.created": "added a customer",
  "customer.updated": "updated a customer",
  "customer.deleted": "removed a customer",
  "user.created": "invited a team member",
  "user.updated": "updated a team member",
  "tenant.created": "created the workspace",
  "settings.updated": "updated workspace settings",
  "auth.login": "signed in",
  "auth.logout": "signed out",
};

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  booking: <CalendarIcon size={16} />,
  driver: <UsersIcon size={16} />,
  cab: <CarIcon size={16} />,
  customer: <BuildingIcon size={16} />,
  user: <UserIcon size={16} />,
  settings: <SettingsIcon size={16} />,
  tenant: <ShieldIcon size={16} />,
};

const SUBJECT_KEYS = ["name", "plate", "model", "email", "display_name"];

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ");
}

function subjectOf(meta: Record<string, unknown>): string | null {
  for (const key of SUBJECT_KEYS) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - start.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return fmtDate(iso);
}

function timeLabel(iso: string, group: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  if (group === "Today") {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return fmtDateTime(iso);
}

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState<EntityFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          page_size: String(PAGE_SIZE),
        });
        if (entity !== "all") params.set("entity", entity);
        const data = await api<Page<ActivityItem>>(`/activity?${params}`);
        setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
        setTotal(data.total);
        setPage(nextPage);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not load activity.",
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [entity],
  );

  useEffect(() => {
    void load(1, true);
  }, [load]);

  const groups: Array<{ label: string; rows: ActivityItem[] }> = [];
  for (const item of items) {
    const label = dayLabel(item.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(item);
    else groups.push({ label, rows: [item] });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity"
        subtitle="Everything that happened in your workspace."
        actions={
          <Button
            variant="outline"
            size="md"
            onClick={() => void load(1, true)}
            disabled={loading}
          >
            <RefreshIcon size={16} />
            Refresh
          </Button>
        }
      />

      <Card padded={false}>
        <div className="overflow-x-auto border-b border-border p-3">
          <Segmented
            ariaLabel="Filter by type"
            options={
              [
                { value: "all", label: "All" },
                { value: "booking", label: "Bookings" },
                { value: "driver", label: "Drivers" },
                { value: "cab", label: "Cabs" },
                { value: "customer", label: "Customers" },
                { value: "user", label: "Users" },
                { value: "settings", label: "Settings" },
              ] as Array<{ value: EntityFilter; label: string }>
            }
            value={entity}
            onChange={(next) => setEntity(next)}
          />
        </div>

        <ErrorBanner message={error} />

        {loading ? (
          <div className="space-y-2 p-4" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<InboxIcon size={28} />}
            title="No activity yet"
            hint="Actions across bookings, drivers, cabs and settings will appear here."
          />
        ) : (
          <div>
            {groups.map((group) => (
              <section key={`${group.label}-${group.rows[0].id}`}>
                <h2 className="border-b border-border bg-surface-2/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                  {group.label}
                </h2>
                <ul className="divide-y divide-border">
                  {group.rows.map((item) => {
                    const subject = subjectOf(item.meta);
                    return (
                      <li
                        key={item.id}
                        className="flex min-h-14 items-center gap-3 px-4 py-2.5"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
                          {ENTITY_ICONS[item.entity] ?? <InfoIcon size={16} />}
                        </span>
                        <p className="min-w-0 flex-1 truncate text-sm">
                          <span className="font-medium">
                            {item.user_name ?? "System"}
                          </span>{" "}
                          <span className="text-muted">
                            {actionLabel(item.action)}
                          </span>
                          {subject && <span> · {subject}</span>}
                        </p>
                        <span
                          className="shrink-0 text-xs tabular-nums text-muted"
                          title={fmtDateTime(item.created_at)}
                        >
                          {timeLabel(item.created_at, group.label)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <p className="text-xs text-muted">
                Showing {items.length} of {total}
              </p>
              {items.length < total && (
                <Button
                  variant="outline"
                  size="sm"
                  loading={loadingMore}
                  onClick={() => void load(page + 1, false)}
                >
                  Load older
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
