"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useMe } from "@/components/auth-context";
import { BuildingIcon, CheckIcon, ShieldIcon } from "@/components/Icons";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { api } from "@/lib/api";
import { applyBrand, isHex, readableOn } from "@/lib/branding";
import type { SettingsOut } from "@/lib/types";

interface FormState {
  display_name: string;
  primary_color: string;
  accent_color: string;
  logo_url: string;
  currency: string;
  timezone: string;
  custom_domain: string;
  fare_base: string;
  fare_per_km: string;
  fare_per_min: string;
}

function fromSettings(settings: SettingsOut): FormState {
  return {
    display_name: settings.brand.display_name ?? "",
    primary_color: settings.brand.primary_color ?? "",
    accent_color: settings.brand.accent_color ?? "",
    logo_url: settings.brand.logo_url ?? "",
    currency: settings.currency,
    timezone: settings.timezone,
    custom_domain: (settings as SettingsOut & { custom_domain?: string })
      .custom_domain ?? "",
    fare_base: String(settings.fare?.base ?? "2.5"),
    fare_per_km: String(settings.fare?.per_km ?? "1.2"),
    fare_per_min: String(settings.fare?.per_min ?? "0.3"),
  };
}

export default function SettingsPage() {
  const { me } = useMe();
  const canEdit = ["owner", "admin"].includes(me.user.role);
  const customDomainEnabled = Boolean(me.features?.custom_domain);

  const [settings, setSettings] = useState<SettingsOut | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<SettingsOut>("/settings");
        if (cancelled) return;
        setSettings(data);
        setForm(fromSettings(data));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load settings.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function patch(values: Partial<FormState>) {
    setForm((current) => (current ? { ...current, ...values } : current));
  }

  // Live brand preview while editing colors.
  useEffect(() => {
    if (!form || !canEdit) return;
    applyBrand({
      primary_color: isHex(form.primary_color) ? form.primary_color : null,
      accent_color: isHex(form.accent_color) ? form.accent_color : null,
    });
  }, [form?.primary_color, form?.accent_color, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        currency: form.currency.toUpperCase(),
        timezone: form.timezone,
        brand: {
          display_name: form.display_name || null,
          primary_color: form.primary_color || null,
          accent_color: form.accent_color || null,
          logo_url: form.logo_url || null,
        },
        fare: {
          base: Number.parseFloat(form.fare_base),
          per_km: Number.parseFloat(form.fare_per_km),
          per_min: Number.parseFloat(form.fare_per_min),
        },
      };
      if (customDomainEnabled && form.custom_domain) {
        body.custom_domain = form.custom_domain.toLowerCase();
      }
      const data = await api<SettingsOut>("/settings", {
        method: "PATCH",
        body,
      });
      setSettings(data);
      applyBrand(data.brand);
      // Keep the sidebar name in sync without a full reload.
      window.dispatchEvent(
        new CustomEvent("cabdesk:brand", {
          detail: { display_name: data.brand.display_name },
        }),
      );
      toast.success("Settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form || !settings) {
    return (
      <div className="flex items-center justify-center py-24 text-muted">
        <Spinner />
      </div>
    );
  }

  const features = settings.features ?? {};
  const previewColor = isHex(form.primary_color) ? form.primary_color : "#0f766e";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        subtitle="Branding, locale and fare configuration for your workspace."
      />

      {!canEdit && (
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          Only owners and admins can change settings — you're seeing a read-only
          view.
        </div>
      )}

      <form onSubmit={save} className="space-y-5">
        <Card title="Branding">
          <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
            <div className="space-y-4">
              <Field
                label="Display name"
                hint="Shown on sign-in and throughout the app instead of your legal name."
              >
                <Input
                  value={form.display_name}
                  onChange={(e) => patch({ display_name: e.target.value })}
                  placeholder={me.tenant.name}
                  disabled={!canEdit}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Primary color" hint="Hex like #0f766e">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Primary color picker"
                      value={isHex(form.primary_color) ? form.primary_color : "#0f766e"}
                      onChange={(e) => patch({ primary_color: e.target.value })}
                      disabled={!canEdit}
                      className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-surface p-1"
                    />
                    <Input
                      value={form.primary_color}
                      onChange={(e) => patch({ primary_color: e.target.value })}
                      placeholder="#0f766e"
                      disabled={!canEdit}
                    />
                  </div>
                </Field>
                <Field label="Accent color" hint="Optional highlight color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Accent color picker"
                      value={isHex(form.accent_color) ? form.accent_color : "#f59e0b"}
                      onChange={(e) => patch({ accent_color: e.target.value })}
                      disabled={!canEdit}
                      className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-surface p-1"
                    />
                    <Input
                      value={form.accent_color}
                      onChange={(e) => patch({ accent_color: e.target.value })}
                      placeholder="#f59e0b"
                      disabled={!canEdit}
                    />
                  </div>
                </Field>
              </div>
              <Field
                label="Logo URL"
                hint="A square image works best; leave empty to use the default mark."
              >
                <Input
                  value={form.logo_url}
                  onChange={(e) => patch({ logo_url: e.target.value })}
                  placeholder="https://cdn.example.com/logo.png"
                  disabled={!canEdit}
                />
              </Field>
            </div>

            <div>
              <span className="block text-xs font-medium text-muted">
                Preview
              </span>
              <div className="mt-1.5 overflow-hidden rounded-xl border border-border">
                <div
                  className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold"
                  style={{ background: previewColor, color: readableOn(previewColor) }}
                >
                  {form.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.logo_url}
                      alt=""
                      className="h-6 w-6 rounded bg-white/15 object-contain p-0.5"
                    />
                  ) : (
                    <BuildingIcon size={16} />
                  )}
                  {form.display_name || me.tenant.name}
                </div>
                <div className="space-y-2 bg-surface p-3">
                  <div className="h-2 w-3/4 rounded bg-surface-2" />
                  <div className="h-2 w-1/2 rounded bg-surface-2" />
                  <span
                    className="mt-1 inline-block rounded-lg px-2.5 py-1 text-xs font-medium"
                    style={{ background: previewColor, color: readableOn(previewColor) }}
                  >
                    Primary button
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Company">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency" hint="3-letter code, e.g. USD, EUR, AED">
              <Input
                value={form.currency}
                onChange={(e) => patch({ currency: e.target.value.toUpperCase() })}
                maxLength={3}
                placeholder="USD"
                disabled={!canEdit}
              />
            </Field>
            <Field label="Timezone" hint="IANA name, e.g. Europe/London">
              <Input
                value={form.timezone}
                onChange={(e) => patch({ timezone: e.target.value })}
                placeholder="UTC"
                disabled={!canEdit}
              />
            </Field>
          </div>
        </Card>

        <Card title="Fare estimation">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={`Base fare (${form.currency})`}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.fare_base}
                onChange={(e) => patch({ fare_base: e.target.value })}
                disabled={!canEdit}
              />
            </Field>
            <Field label={`Per km (${form.currency})`}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.fare_per_km}
                onChange={(e) => patch({ fare_per_km: e.target.value })}
                disabled={!canEdit}
              />
            </Field>
            <Field label={`Per minute (${form.currency})`}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.fare_per_min}
                onChange={(e) => patch({ fare_per_min: e.target.value })}
                disabled={!canEdit}
              />
            </Field>
          </div>
        </Card>

        <Card title="Custom domain">
          {customDomainEnabled ? (
            <Field
              label="Domain"
              hint="Point a CNAME to this deployment. TLS is issued automatically when the domain is connected."
            >
              <Input
                value={form.custom_domain}
                onChange={(e) => patch({ custom_domain: e.target.value })}
                placeholder="bookings.yourcompany.com"
                disabled={!canEdit}
              />
            </Field>
          ) : (
            <p className="text-sm text-muted">
              Custom domains aren&apos;t enabled for this workspace. Your
              workspace is reachable at its workspace slug.
            </p>
          )}
        </Card>

        <Card title="Plan and limits">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="assigned">{me.tenant.plan} plan</Badge>
            <span className="text-muted">
              up to {String(features.max_cabs ?? "—")} cabs ·{" "}
              {String(features.max_users ?? "—")} users
            </span>
            {features.reports && (
              <span className="flex items-center gap-1 text-xs text-success">
                <CheckIcon size={12} /> Reports
              </span>
            )}
            {features.custom_domain && (
              <span className="flex items-center gap-1 text-xs text-success">
                <CheckIcon size={12} /> Custom domain
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-muted">
              <ShieldIcon size={12} /> Tenant data isolated with row-level
              security
            </span>
          </div>
        </Card>

        {canEdit && (
          <div className="flex items-center gap-3">
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        )}

        <ErrorBanner message={error} />
      </form>
    </div>
  );
}
