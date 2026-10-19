"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useMe } from "@/components/auth-context";
import {
  CarIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
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
import { fmtDate } from "@/lib/format";
import type { Cab, Page } from "@/lib/types";

const STATUSES = ["available", "busy", "maintenance"] as const;
type StatusFilter = (typeof STATUSES)[number] | "all";

interface CabFormState {
  model: string;
  plate: string;
  capacity: number;
  status: (typeof STATUSES)[number];
  insurance_expiry: string;
  registration_expiry: string;
}

const EMPTY_FORM: CabFormState = {
  model: "",
  plate: "",
  capacity: 4,
  status: "available",
  insurance_expiry: "",
  registration_expiry: "",
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

/** Two-line compliance summary used in the fleet table. */
function ComplianceCell({
  insurance,
  registration,
}: {
  insurance: string | null;
  registration: string | null;
}) {
  if (!insurance && !registration) {
    return <span className="text-xs text-muted">—</span>;
  }
  const rows = [
    { label: "Insurance", date: insurance },
    { label: "Registration", date: registration },
  ];
  return (
    <div className="space-y-1">
      {rows.map((row) => {
        const info = expiryInfo(row.date);
        return (
          <p key={row.label} className="flex items-center gap-1.5 text-xs">
            <span className="text-muted">{row.label}</span>
            {info && info.level !== "ok" ? (
              <Badge tone={expiryTone(info)}>{expiryBadgeText(info)}</Badge>
            ) : (
              <span className="tabular-nums text-muted">
                {row.date ? fmtDate(row.date) : "not set"}
              </span>
            )}
          </p>
        );
      })}
    </div>
  );
}

export default function CabsPage() {
  const { me } = useMe();
  const canWrite = ["owner", "admin", "manager"].includes(me.user.role);

  const [list, setList] = useState<Page<Cab> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Cab | null>(null);
  const [deleting, setDeleting] = useState<Cab | null>(null);
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
      setList(await api<Page<Cab>>(`/cabs?${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load cabs.");
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
  // when a cab is opened while this page is already mounted.
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

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(cab: Cab) {
    setEditing(cab);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    setDeletingBusy(true);
    try {
      await api<void>(`/cabs/${deleting.id}`, { method: "DELETE" });
      toast.success("Cab removed");
      setDeleting(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not remove cab.",
      );
    } finally {
      setDeletingBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cabs"
        subtitle="Your fleet — keep statuses current so dispatching stays accurate."
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <PlusIcon size={16} />
              Add cab
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
              placeholder="Search model or plate…"
              className="pl-9"
            />
          </div>
          <Segmented
            ariaLabel="Filter by status"
            options={
              [
                { value: "all", label: "All" },
                { value: "available", label: "Available" },
                { value: "busy", label: "Busy" },
                { value: "maintenance", label: "Maintenance" },
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
            icon={<CarIcon size={28} />}
            title={query ? "No cabs match your search" : "No cabs yet"}
            hint={
              query
                ? "Try different keywords, or clear the search and status filter."
                : "Add your first cab to start assigning trips."
            }
            action={
              canWrite && !query ? (
                <Button onClick={openCreate}>
                  <PlusIcon size={16} />
                  Add cab
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
                    <th className="px-4 py-2.5 font-medium">Model</th>
                    <th className="px-4 py-2.5 font-medium">Plate</th>
                    <th className="px-4 py-2.5 font-medium">Capacity</th>
                    <th className="px-4 py-2.5 font-medium">Compliance</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    {canWrite && (
                      <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.items.map((cab) => (
                    <tr key={cab.id} className="hover:bg-surface-2/60">
                      <td className="px-4 py-3 font-medium">{cab.model}</td>
                      <td className="px-4 py-3 font-mono text-xs">{cab.plate}</td>
                      <td className="px-4 py-3">{cab.capacity}</td>
                      <td className="px-4 py-3">
                        <ComplianceCell
                          insurance={cab.insurance_expiry}
                          registration={cab.registration_expiry}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={cab.status}>{cab.status}</Badge>
                      </td>
                      {canWrite && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(cab)}
                            aria-label={`Edit ${cab.model}`}
                          >
                            <PencilIcon size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleting(cab);
                            }}
                            aria-label={`Remove ${cab.model}`}
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
              {list.items.map((cab) => (
                <li key={cab.id} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-brand">
                    <CarIcon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{cab.model}</p>
                    <p className="text-xs text-muted">
                      {cab.plate} · {cab.capacity} seats
                    </p>
                    <ExpiryBadge date={cab.insurance_expiry} prefix="Insurance" />
                    <ExpiryBadge
                      date={cab.registration_expiry}
                      prefix="Registration"
                    />
                  </div>
                  <Badge tone={cab.status}>{cab.status}</Badge>
                  {canWrite && (
                    <div className="flex shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(cab)}
                        aria-label={`Edit ${cab.model}`}
                      >
                        <PencilIcon size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(cab);
                        }}
                        aria-label={`Remove ${cab.model}`}
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

      <CabFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        cab={editing}
        onSaved={() => {
          setFormOpen(false);
          setRefreshKey((k) => k + 1);
        }}
      />

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Remove cab"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={deletingBusy} onClick={confirmDelete}>
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Remove <strong>{deleting?.model}</strong> ({deleting?.plate}) from your
          fleet?
        </p>
        <div className="mt-3">
          <ErrorBanner message={deleteError} />
        </div>
      </Modal>
    </div>
  );
}

function CabFormModal({
  open,
  onClose,
  cab,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  cab: Cab | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CabFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        cab
          ? {
              model: cab.model,
              plate: cab.plate,
              capacity: cab.capacity,
              status: (cab.status as CabFormState["status"]) ?? "available",
              insurance_expiry: cab.insurance_expiry ?? "",
              registration_expiry: cab.registration_expiry ?? "",
            }
          : EMPTY_FORM,
      );
      setError(null);
      setSaving(false);
    }
  }, [open, cab]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = {
        ...form,
        plate: form.plate.toUpperCase(),
        capacity: Number(form.capacity),
        insurance_expiry: form.insurance_expiry || null,
        registration_expiry: form.registration_expiry || null,
      };
      if (cab) {
        await api<Cab>(`/cabs/${cab.id}`, { method: "PATCH", body });
      } else {
        await api<Cab>("/cabs", { method: "POST", body });
      }
      toast.success(cab ? "Cab updated" : "Cab added");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save cab.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={cab ? "Edit cab" : "Add cab"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="cab-form" loading={saving}>
            {cab ? "Save changes" : "Add cab"}
          </Button>
        </>
      }
    >
      <form id="cab-form" onSubmit={submit} className="space-y-4">
        <Field label="Model">
          <Input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="Toyota Prius"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plate">
            <Input
              value={form.plate}
              onChange={(e) => setForm({ ...form, plate: e.target.value })}
              placeholder="ABC-1234"
              required
            />
          </Field>
          <Field label="Capacity">
            <Input
              type="number"
              min={1}
              max={30}
              value={form.capacity}
              onChange={(e) =>
                setForm({ ...form, capacity: Number(e.target.value) })
              }
              required
            />
          </Field>
        </div>
        <Field label="Status">
          <Select
            value={form.status}
            onChange={(e) =>
              setForm({
                ...form,
                status: e.target.value as CabFormState["status"],
              })
            }
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Insurance expiry (optional)"
            hint="Badged in the fleet list when due within 30 days."
          >
            <Input
              type="date"
              value={form.insurance_expiry}
              onChange={(e) =>
                setForm({ ...form, insurance_expiry: e.target.value })
              }
            />
          </Field>
          <Field label="Registration expiry (optional)">
            <Input
              type="date"
              value={form.registration_expiry}
              onChange={(e) =>
                setForm({ ...form, registration_expiry: e.target.value })
              }
            />
          </Field>
        </div>
        <ErrorBanner message={error} />
      </form>
    </Modal>
  );
}
