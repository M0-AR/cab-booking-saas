"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useMe } from "@/components/auth-context";
import {
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/Icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Segmented,
  Select,
  Spinner,
} from "@/components/ui";
import { api } from "@/lib/api";
import { expiryBadgeText, expiryInfo, expiryTone } from "@/lib/compliance";
import type { Driver, Page } from "@/lib/types";

const STATUSES = ["active", "inactive", "on_trip"] as const;
type StatusFilter = (typeof STATUSES)[number] | "all";

interface DriverFormState {
  name: string;
  phone: string;
  license_no: string;
  license_expiry: string;
  status: (typeof STATUSES)[number];
}

const EMPTY_FORM: DriverFormState = {
  name: "",
  phone: "",
  license_no: "",
  license_expiry: "",
  status: "active",
};

/** Inline badge shown only when a document is due within 30 days or expired. */
function ExpiryBadge({ date, prefix }: { date: string | null; prefix?: string }) {
  const info = expiryInfo(date);
  if (!info || info.level === "ok") return null;
  return (
    <span className="mt-0.5 inline-block">
      <Badge tone={expiryTone(info)}>
        {prefix ? `${prefix} ` : ""}
        {expiryBadgeText(info)}
      </Badge>
    </span>
  );
}

export default function DriversPage() {
  const { me } = useMe();
  const canWrite = ["owner", "admin", "manager"].includes(me.user.role);

  const [list, setList] = useState<Page<Driver> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [deleting, setDeleting] = useState<Driver | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const pageSize = 20;

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (status !== "all") params.set("status", status);
      if (query) params.set("q", query);
      setList(await api<Page<Driver>>(`/drivers?${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load drivers.");
    } finally {
      setLoading(false);
    }
  }, [page, status, query]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setQuery(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Deep links: ?q= on first paint, and the palette's "cabdesk:search" event
  // when a driver is opened while this page is already mounted.
  useEffect(() => {
    const apply = (value: string | null) => {
      if (value) setSearch(value);
    };
    apply(new URLSearchParams(window.location.search).get("q"));
    const onSearch = (event: Event) => {
      const detail = (event as CustomEvent<{ q?: string }>).detail;
      apply(detail?.q ?? null);
    };
    window.addEventListener("cabdesk:search", onSearch);
    return () => window.removeEventListener("cabdesk:search", onSearch);
  }, []);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    setDeletingBusy(true);
    try {
      await api<void>(`/drivers/${deleting.id}`, { method: "DELETE" });
      toast.success("Driver removed");
      setDeleting(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not remove driver.",
      );
    } finally {
      setDeletingBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Drivers"
        subtitle="Everyone who can be assigned to trips."
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <PlusIcon size={16} />
              Add driver
            </Button>
          ) : undefined
        }
      />

      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-xs sm:flex-1">
            <SearchIcon
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone or license…"
              className="pl-9"
            />
          </div>
          <Segmented
            ariaLabel="Filter by status"
            options={
              [
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "on_trip", label: "On trip" },
              ] as Array<{ value: StatusFilter; label: string }>
            }
            value={status}
            onChange={(next) => {
              setPage(1);
              setStatus(next);
            }}
          />
        </div>

        <ErrorBanner message={error} />

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <Spinner />
          </div>
        ) : !list || list.items.length === 0 ? (
          <EmptyState
            icon={<UsersIcon size={28} />}
            title={query ? "No drivers match your search" : "No drivers yet"}
            hint={
              query
                ? "Try different keywords, or clear the search and status filter."
                : "Add drivers so bookings can be assigned."
            }
            action={
              canWrite && !query ? (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <PlusIcon size={16} />
                  Add driver
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Phone</th>
                    <th className="px-4 py-2.5 font-medium">License</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    {canWrite && (
                      <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.items.map((driver) => (
                    <tr key={driver.id} className="hover:bg-surface-2/60">
                      <td className="px-4 py-3 font-medium">{driver.name}</td>
                      <td className="px-4 py-3">{driver.phone}</td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs">
                          {driver.license_no ?? "—"}
                        </p>
                        <ExpiryBadge date={driver.license_expiry} prefix="License" />
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={driver.status}>
                          {driver.status.replace("_", " ")}
                        </Badge>
                      </td>
                      {canWrite && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(driver);
                              setFormOpen(true);
                            }}
                            aria-label={`Edit ${driver.name}`}
                          >
                            <PencilIcon size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleting(driver);
                            }}
                            aria-label={`Remove ${driver.name}`}
                          >
                            <TrashIcon size={14} />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border md:hidden">
              {list.items.map((driver) => (
                <li key={driver.id} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-brand">
                    {driver.name
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{driver.name}</p>
                    <p className="text-xs text-muted">{driver.phone}</p>
                    <ExpiryBadge date={driver.license_expiry} prefix="License" />
                  </div>
                  <Badge tone={driver.status}>
                    {driver.status.replace("_", " ")}
                  </Badge>
                  {canWrite && (
                    <div className="flex shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(driver);
                          setFormOpen(true);
                        }}
                        aria-label={`Edit ${driver.name}`}
                      >
                        <PencilIcon size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(driver);
                        }}
                        aria-label={`Remove ${driver.name}`}
                      >
                        <TrashIcon size={14} />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="border-t border-border px-4">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={list.total}
                onPage={setPage}
              />
            </div>
          </>
        )}
      </Card>

      <DriverFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        driver={editing}
        onSaved={() => {
          setFormOpen(false);
          setRefreshKey((k) => k + 1);
        }}
      />

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Remove driver"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Keep them
            </Button>
            <Button variant="danger" loading={deletingBusy} onClick={confirmDelete}>
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Remove <strong>{deleting?.name}</strong> from your driver roster?
        </p>
        <p className="mt-1 text-xs text-muted">
          Historical bookings stay intact. Drivers on active trips can't be
          removed.
        </p>
        <div className="mt-3">
          <ErrorBanner message={deleteError} />
        </div>
      </Modal>
    </div>
  );
}

function DriverFormModal({
  open,
  onClose,
  driver,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  driver: Driver | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<DriverFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        driver
          ? {
              name: driver.name,
              phone: driver.phone,
              license_no: driver.license_no ?? "",
              license_expiry: driver.license_expiry ?? "",
              status: (driver.status as DriverFormState["status"]) ?? "active",
            }
          : EMPTY_FORM,
      );
      setError(null);
      setSaving(false);
    }
  }, [open, driver]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = {
        name: form.name,
        phone: form.phone,
        license_no: form.license_no || null,
        license_expiry: form.license_expiry || null,
        status: form.status,
      };
      if (driver) {
        await api<Driver>(`/drivers/${driver.id}`, { method: "PATCH", body });
      } else {
        await api<Driver>("/drivers", { method: "POST", body });
      }
      toast.success(driver ? "Driver updated" : "Driver added");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save driver.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={driver ? "Edit driver" : "Add driver"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="driver-form" loading={saving}>
            {driver ? "Save changes" : "Add driver"}
          </Button>
        </>
      }
    >
      <form id="driver-form" onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Sam Carter"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 555 010 2030"
              required
            />
          </Field>
          <Field label="License no. (optional)">
            <Input
              value={form.license_no}
              onChange={(e) => setForm({ ...form, license_no: e.target.value })}
              placeholder="D1234-5678"
            />
          </Field>
        </div>
        <Field
          label="License expiry (optional)"
          hint="Badged in the roster when it falls due within 30 days."
        >
          <Input
            type="date"
            value={form.license_expiry}
            onChange={(e) =>
              setForm({ ...form, license_expiry: e.target.value })
            }
          />
        </Field>
        <Field label="Status" hint="Trips can only be assigned to active drivers.">
          <Select
            value={form.status}
            onChange={(e) =>
              setForm({
                ...form,
                status: e.target.value as DriverFormState["status"],
              })
            }
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
        <ErrorBanner message={error} />
      </form>
    </Modal>
  );
}
