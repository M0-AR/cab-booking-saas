"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useMe } from "@/components/auth-context";
import { PencilIcon, PlusIcon, SearchIcon, TrashIcon, UsersIcon } from "@/components/Icons";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
} from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { Customer, Page } from "@/lib/types";

interface CustomerFormState {
  name: string;
  phone: string;
  email: string;
}

const EMPTY_FORM: CustomerFormState = { name: "", phone: "", email: "" };

export default function CustomersPage() {
  const { me } = useMe();
  const canWrite = ["owner", "admin", "manager"].includes(me.user.role);

  const [list, setList] = useState<Page<Customer> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [query, setQuery] = useState("");

  const pageSize = 20;

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setQuery(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (query) params.set("q", query);
      setList(await api<Page<Customer>>(`/customers?${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load customers.");
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, refreshKey]);

  // Deep links: ?q= on first paint, and the palette's "cabdesk:search" event
  // when a customer is opened while this page is already mounted.
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
      await api<void>(`/customers/${deleting.id}`, { method: "DELETE" });
      toast.success("Customer removed");
      setDeleting(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not remove customer.",
      );
    } finally {
      setDeletingBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        subtitle="People who book rides with you."
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <PlusIcon size={16} />
              Add customer
            </Button>
          ) : undefined
        }
      />

      <Card padded={false}>
        <div className="border-b border-border p-3">
          <div className="relative">
            <SearchIcon
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone or email…"
              className="pl-9"
            />
          </div>
        </div>

        <ErrorBanner message={error} />

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <Spinner />
          </div>
        ) : !list || list.items.length === 0 ? (
          <EmptyState
            icon={<UsersIcon size={28} />}
            title={query ? `No customers match “${query}”` : "No customers yet"}
            hint={
              query
                ? "Try a different search term."
                : "Add customers so you can create bookings for them."
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
                  Add customer
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {list.items.map((customer) => (
                <li
                  key={customer.id}
                  className="flex items-center gap-3 px-4 py-3.5"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-brand">
                    {customer.name
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{customer.name}</p>
                    <p className="truncate text-xs text-muted">
                      {customer.phone}
                      {customer.email ? ` · ${customer.email}` : ""}
                    </p>
                  </div>
                  <span className="hidden text-xs text-muted sm:block">
                    since {fmtDate(customer.created_at)}
                  </span>
                  {canWrite && (
                    <div className="flex shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(customer);
                          setFormOpen(true);
                        }}
                        aria-label={`Edit ${customer.name}`}
                      >
                        <PencilIcon size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(customer);
                        }}
                        aria-label={`Remove ${customer.name}`}
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

      <CustomerFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        customer={editing}
        onSaved={() => {
          setFormOpen(false);
          setRefreshKey((k) => k + 1);
        }}
      />

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Remove customer"
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
          Remove <strong>{deleting?.name}</strong>? Customers with booking
          history can't be removed.
        </p>
        <div className="mt-3">
          <ErrorBanner message={deleteError} />
        </div>
      </Modal>
    </div>
  );
}

function CustomerFormModal({
  open,
  onClose,
  customer,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        customer
          ? {
              name: customer.name,
              phone: customer.phone,
              email: customer.email ?? "",
            }
          : EMPTY_FORM,
      );
      setError(null);
      setSaving(false);
    }
  }, [open, customer]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = {
        name: form.name,
        phone: form.phone,
        email: form.email || null,
      };
      if (customer) {
        await api<Customer>(`/customers/${customer.id}`, {
          method: "PATCH",
          body,
        });
      } else {
        await api<Customer>("/customers", { method: "POST", body });
      }
      toast.success(customer ? "Customer updated" : "Customer added");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save customer.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? "Edit customer" : "Add customer"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" loading={saving}>
            {customer ? "Save changes" : "Add customer"}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Alex Morgan"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 555 010 3040"
              required
            />
          </Field>
          <Field label="Email (optional)">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="alex@example.com"
            />
          </Field>
        </div>
        <ErrorBanner message={error} />
      </form>
    </Modal>
  );
}
