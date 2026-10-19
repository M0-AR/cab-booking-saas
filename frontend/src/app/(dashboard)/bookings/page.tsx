"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { useMe } from "@/components/auth-context";
import {
  CalendarIcon,
  DownloadIcon,
  MapPinIcon,
  MoreIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
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
  Skeleton,
  Textarea,
  cn,
} from "@/components/ui";
import { api, downloadFile } from "@/lib/api";
import { fmtDateTime, fmtMoney, toLocalInputValue } from "@/lib/format";
import type {
  Booking,
  BookingStatus,
  Cab,
  Customer,
  Driver,
  Page,
  SettingsOut,
} from "@/lib/types";

type StatusFilter = BookingStatus | "all";

export default function BookingsPage() {
  const { me } = useMe();
  const canWrite = ["owner", "admin", "manager"].includes(me.user.role);

  const [list, setList] = useState<Page<Booking> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [refreshKey, setRefreshKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [cabs, setCabs] = useState<Cab[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<Booking | null>(null);
  const [completeFor, setCompleteFor] = useState<Booking | null>(null);
  const [cancelFor, setCancelFor] = useState<Booking | null>(null);

  const pageSize = 20;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1" && canWrite) setCreateOpen(true);
  }, [canWrite]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setQuery(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Deep links: ?q= on first paint, and the palette's "cabdesk:search" event
  // when a record is opened while this page is already mounted.
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await api<SettingsOut>("/settings");
        if (!cancelled) setCurrency(settings.currency);
      } catch {
        /* currency fallback stays USD */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (status !== "all") params.set("status", status);
      if (query) params.set("q", query);
      setList(await api<Page<Booking>>(`/bookings?${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load bookings.");
    } finally {
      setLoading(false);
    }
  }, [page, status, query]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, refreshKey]);

  const loadPickerData = useCallback(async () => {
    try {
      const [customerPage, driverPage, cabPage] = await Promise.all([
        api<Page<Customer>>("/customers?page=1&page_size=100"),
        api<Page<Driver>>("/drivers?page=1&page_size=100"),
        api<Page<Cab>>("/cabs?page=1&page_size=100"),
      ]);
      setCustomers(customerPage.items);
      setDrivers(driverPage.items);
      setCabs(cabPage.items);
    } catch {
      /* pickers best-effort; forms validate anyway */
    }
  }, []);

  useEffect(() => {
    void loadPickerData();
  }, [loadPickerData]);

  const visible = list?.items ?? [];

  async function exportCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (query) params.set("q", query);
      const suffix = params.toString();
      await downloadFile(
        `/bookings/export.csv${suffix ? `?${suffix}` : ""}`,
        "bookings.csv",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  function afterMutation() {
    setCreateOpen(false);
    setAssignFor(null);
    setCompleteFor(null);
    setCancelFor(null);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bookings"
        subtitle="Create, assign and complete trips."
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
              onClick={() => setRefreshKey((k) => k + 1)}
              aria-label="Refresh"
            >
              <RefreshIcon size={16} />
            </Button>
            {canWrite && (
              <Button size="md" onClick={() => setCreateOpen(true)}>
                <PlusIcon size={16} />
                New booking
              </Button>
            )}
          </>
        }
      />

      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <SearchIcon
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, phone, route or driver…"
              className="pl-9"
            />
          </div>
          <Segmented
            ariaLabel="Filter by status"
            options={
              [
                { value: "all", label: "All" },
                { value: "pending", label: "Pending" },
                { value: "assigned", label: "Assigned" },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
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
          <div className="space-y-2 p-4" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={28} />}
            title={query ? "No bookings match your search" : "No bookings yet"}
            hint={
              query
                ? "Try different keywords, or clear the search and status filter."
                : "Create your first booking to get started."
            }
            action={
              canWrite && !query ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <PlusIcon size={16} />
                  New booking
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Desktop table — uniform 56px rows, single-line cells, tabular
                numerals right-aligned (verified against Carbon/shadcn table
                practice: cells never wrap, long values truncate with title). */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="w-[190px] px-4 py-2.5 font-medium">
                      Customer
                    </th>
                    <th className="px-4 py-2.5 font-medium">Route</th>
                    <th className="w-[155px] px-4 py-2.5 font-medium">
                      Scheduled
                    </th>
                    <th className="w-[165px] px-4 py-2.5 font-medium">
                      Driver / Cab
                    </th>
                    <th className="w-[95px] px-4 py-2.5 text-right font-medium">
                      Fare
                    </th>
                    <th className="w-[120px] px-4 py-2.5 font-medium">Status</th>
                    {canWrite && (
                      <th className="w-[150px] px-4 py-2.5 text-right font-medium">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((booking) => (
                    <tr
                      key={booking.id}
                      className="h-14 transition-colors hover:bg-surface-2/60"
                    >
                      <td className="px-4">
                        <p
                          className="max-w-[11rem] truncate font-medium"
                          title={booking.customer.name}
                        >
                          {booking.customer.name}
                        </p>
                        <p
                          className="max-w-[11rem] truncate text-xs tabular-nums text-muted"
                          title={booking.customer.phone}
                        >
                          {booking.customer.phone}
                        </p>
                      </td>
                      <td className="px-4">
                        <p
                          className="max-w-[16rem] truncate"
                          title={booking.pickup}
                        >
                          {booking.pickup}
                        </p>
                        <p
                          className="max-w-[16rem] truncate text-xs text-muted"
                          title={booking.dropoff}
                        >
                          → {booking.dropoff}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 tabular-nums text-muted">
                        {fmtDateTime(booking.scheduled_at)}
                      </td>
                      <td className="px-4">
                        {booking.driver ? (
                          <>
                            <p
                              className="max-w-[10rem] truncate"
                              title={booking.driver.name}
                            >
                              {booking.driver.name}
                            </p>
                            <p
                              className="max-w-[10rem] truncate text-xs text-muted"
                              title={booking.cab?.model ?? "No cab"}
                            >
                              {booking.cab?.model ?? "No cab"}
                            </p>
                          </>
                        ) : (
                          <span className="text-muted" aria-hidden="true">
                            —
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 text-right font-medium tabular-nums">
                        {booking.fare ? (
                          fmtMoney(booking.fare, currency)
                        ) : (
                          <span
                            className="font-normal text-muted"
                            aria-hidden="true"
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4">
                        <Badge tone={booking.status}>{booking.status}</Badge>
                      </td>
                      {canWrite && (
                        <td className="px-4">
                          <RowActions
                            booking={booking}
                            onAssign={() => setAssignFor(booking)}
                            onComplete={() => setCompleteFor(booking)}
                            onCancel={() => setCancelFor(booking)}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-border md:hidden">
              {visible.map((booking) => (
                <li key={booking.id} className="space-y-2 px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {booking.customer.name}
                      </p>
                      <p className="text-xs text-muted">
                        {fmtDateTime(booking.scheduled_at)}
                      </p>
                    </div>
                    <Badge tone={booking.status}>{booking.status}</Badge>
                  </div>
                  <p className="flex items-start gap-1.5 text-sm">
                    <MapPinIcon size={14} className="mt-0.5 shrink-0 text-brand" />
                    <span>
                      {booking.pickup}
                      <span className="text-muted"> → {booking.dropoff}</span>
                    </span>
                  </p>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span>
                      {booking.driver?.name ?? "Unassigned"}
                      {booking.cab ? ` · ${booking.cab.model}` : ""}
                    </span>
                    <span className="font-medium text-fg">
                      {booking.fare ? fmtMoney(booking.fare, currency) : "—"}
                    </span>
                  </div>
                  {canWrite && (
                    <RowActions
                      booking={booking}
                      onAssign={() => setAssignFor(booking)}
                      onComplete={() => setCompleteFor(booking)}
                      onCancel={() => setCancelFor(booking)}
                    />
                  )}
                </li>
              ))}
            </ul>

            <div className="border-t border-border px-4">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={list?.total ?? 0}
                onPage={setPage}
              />
            </div>
          </>
        )}
      </Card>

      <CreateBookingModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        customers={customers}
        onCreated={afterMutation}
      />
      <AssignModal
        booking={assignFor}
        onClose={() => setAssignFor(null)}
        drivers={drivers}
        cabs={cabs}
        onAssigned={afterMutation}
      />
      <CompleteModal
        booking={completeFor}
        onClose={() => setCompleteFor(null)}
        currency={currency}
        onCompleted={afterMutation}
      />
      <CancelModal
        booking={cancelFor}
        onClose={() => setCancelFor(null)}
        onCancelled={afterMutation}
      />
    </div>
  );
}

type RowMenuItem = { label: string; onSelect: () => void; danger?: boolean };

function RowActions({
  booking,
  onAssign,
  onComplete,
  onCancel,
}: {
  booking: Booking;
  onAssign: () => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const canAssign = booking.status === "pending" || booking.status === "assigned";
  const canComplete = booking.status === "assigned";
  const canCancel = booking.status === "pending" || booking.status === "assigned";
  if (!canAssign && !canComplete && !canCancel) return null;

  // One primary action stays inline; secondary/destructive actions live in a
  // menu so rows never wrap (verified: Carbon "reduce clicks" + timely kebab
  // consistency guidance).
  const menuItems: RowMenuItem[] = [
    ...(canComplete && canAssign
      ? [{ label: "Reassign driver", onSelect: onAssign }]
      : []),
    ...(canCancel
      ? [{ label: "Cancel booking", onSelect: onCancel, danger: true }]
      : []),
  ];

  return (
    <div className="flex items-center justify-end gap-1">
      {canComplete ? (
        <Button size="sm" onClick={onComplete}>
          Complete
        </Button>
      ) : canAssign ? (
        <Button variant="outline" size="sm" onClick={onAssign}>
          {booking.status === "assigned" ? "Reassign" : "Assign"}
        </Button>
      ) : null}
      {menuItems.length > 0 && <RowMenu items={menuItems} />}
    </div>
  );
}

function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Positioned with a right offset (no transform) so the scale-in
    // animation can't override placement; flips above near the viewport bottom.
    const menuHeight = items.length * 32 + 16;
    const openUp = rect.bottom + 6 + menuHeight > window.innerHeight - 8;
    setPos({
      top: openUp ? Math.max(8, rect.top - menuHeight - 6) : rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        btnRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus();
    }
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <MoreIcon size={16} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Booking actions"
            className="animate-scale-in elev-card fixed z-[60] min-w-44 rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-overlay)]"
            style={{ top: pos.top, right: pos.right }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              event.preventDefault();
              const buttons = Array.from(
                menuRef.current?.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitem"]',
                ) ?? [],
              );
              if (buttons.length === 0) return;
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === "ArrowDown"
                  ? (index + 1) % buttons.length
                  : (index - 1 + buttons.length) % buttons.length;
              buttons[next]?.focus();
            }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                  item.danger
                    ? "text-danger-ink hover:bg-danger/10"
                    : "hover:bg-surface-2",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function CreateBookingModal({
  open,
  onClose,
  customers,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  onCreated: () => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [fare, setFare] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCustomerId("");
      setPickup("");
      setDropoff("");
      setScheduledAt(toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)));
      setFare("");
      setNotes("");
      setError(null);
      setSaving(false);
    }
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api<Booking>("/bookings", {
        method: "POST",
        body: {
          customer_id: customerId,
          pickup,
          dropoff,
          scheduled_at: new Date(scheduledAt).toISOString(),
          fare: fare === "" ? null : Number.parseFloat(fare),
          notes: notes || null,
        },
      });
      toast.success("Booking created");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create booking.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New booking"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-booking" loading={saving}>
            Create booking
          </Button>
        </>
      }
    >
      <form id="create-booking" onSubmit={submit} className="space-y-4">
        <Field label="Customer">
          <Select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
          >
            <option value="" disabled>
              Select a customer…
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} · {customer.phone}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pickup">
            <Input
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              placeholder="123 Main St"
              required
            />
          </Field>
          <Field label="Drop-off">
            <Input
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
              placeholder="Airport Terminal 2"
              required
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Scheduled at">
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
            />
          </Field>
          <Field label="Fare (optional)" hint="Leave empty to set on completion">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={fare}
              onChange={(e) => setFare(e.target.value)}
              placeholder="24.50"
            />
          </Field>
        </div>
        <Field label="Notes (optional)">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the driver should know…"
          />
        </Field>
        {customers.length === 0 && (
          <p className="text-xs text-muted">
            No customers yet — add one on the Customers page first.
          </p>
        )}
        <ErrorBanner message={error} />
      </form>
    </Modal>
  );
}

function AssignModal({
  booking,
  onClose,
  drivers,
  cabs,
  onAssigned,
}: {
  booking: Booking | null;
  onClose: () => void;
  drivers: Driver[];
  cabs: Cab[];
  onAssigned: () => void;
}) {
  const [driverId, setDriverId] = useState("");
  const [cabId, setCabId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (booking) {
      setDriverId(booking.driver?.id ?? "");
      setCabId(booking.cab?.id ?? "");
      setError(null);
      setSaving(false);
    }
  }, [booking]);

  if (!booking) return null;
  const availableDrivers = drivers.filter(
    (d) => d.status === "active" || d.id === booking.driver?.id,
  );
  const assignableCabs = cabs.filter(
    (c) => c.status !== "maintenance" || c.id === booking.cab?.id,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api<Booking>(`/bookings/${booking!.id}/assign`, {
        method: "POST",
        body: { driver_id: driverId, cab_id: cabId || null },
      });
      toast.success("Booking assigned");
      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign booking.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Assign booking"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="assign-booking" loading={saving}>
            Assign
          </Button>
        </>
      }
    >
      <form id="assign-booking" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">
          {booking.customer.name} · {booking.pickup} → {booking.dropoff}
        </p>
        <Field label="Driver" hint="Only active drivers can be assigned">
          <Select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            required
          >
            <option value="" disabled>
              Select a driver…
            </option>
            {availableDrivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
                {driver.phone ? ` · ${driver.phone}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cab (optional)">
          <Select value={cabId} onChange={(e) => setCabId(e.target.value)}>
            <option value="">No cab</option>
            {assignableCabs.map((cab) => (
              <option key={cab.id} value={cab.id}>
                {cab.model} · {cab.plate}
              </option>
            ))}
          </Select>
        </Field>
        <ErrorBanner message={error} />
      </form>
    </Modal>
  );
}

function CompleteModal({
  booking,
  onClose,
  currency,
  onCompleted,
}: {
  booking: Booking | null;
  onClose: () => void;
  currency: string;
  onCompleted: () => void;
}) {
  const [fare, setFare] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (booking) {
      setFare(booking.fare ?? "");
      setNotes(booking.notes ?? "");
      setError(null);
      setSaving(false);
    }
  }, [booking]);

  if (!booking) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api<Booking>(`/bookings/${booking!.id}/complete`, {
        method: "POST",
        body: {
          fare: fare === "" ? null : Number.parseFloat(fare),
          notes: notes || null,
        },
      });
      toast.success("Booking completed");
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete booking.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Complete booking"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="complete-booking" loading={saving}>
            Mark completed
          </Button>
        </>
      }
    >
      <form id="complete-booking" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">
          {booking.customer.name} · driver {booking.driver?.name ?? "—"}
        </p>
        <Field label={`Final fare (${currency})`}>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={fare}
            onChange={(e) => setFare(e.target.value)}
            placeholder="24.50"
          />
        </Field>
        <Field label="Notes (optional)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <ErrorBanner message={error} />
      </form>
    </Modal>
  );
}

function CancelModal({
  booking,
  onClose,
  onCancelled,
}: {
  booking: Booking | null;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!booking) return null;

  async function confirm() {
    setError(null);
    setSaving(true);
    try {
      await api<Booking>(`/bookings/${booking!.id}/cancel`, { method: "POST" });
      toast.success("Booking cancelled");
      onCancelled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel booking.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Cancel booking"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Keep booking
          </Button>
          <Button variant="danger" loading={saving} onClick={confirm}>
            Yes, cancel it
          </Button>
        </>
      }
    >
      <p className="text-sm">
        Cancel the booking for <strong>{booking.customer.name}</strong> (
        {booking.pickup} → {booking.dropoff})?
      </p>
      <p className="mt-2 text-xs text-muted">
        The assigned driver and cab are freed up automatically.
      </p>
      <div className="mt-3">
        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}
