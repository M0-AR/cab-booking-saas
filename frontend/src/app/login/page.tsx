"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/AuthShell";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { applyBrand, resetBrand } from "@/lib/branding";
import { ApiError, getAccessToken, setSession } from "@/lib/session";
import type { PublicBranding, TokenResponse } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [branding, setBranding] = useState<PublicBranding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const brandingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("tenant");
    const saved =
      fromUrl ?? window.localStorage.getItem("cabdesk.lastTenant") ?? "";
    if (saved) setSlug(saved);
    if (getAccessToken() && !fromUrl) router.replace("/dashboard");
  }, [router]);

  useEffect(() => {
    if (brandingTimer.current) clearTimeout(brandingTimer.current);
    setBranding(null);
    if (!/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(slug)) {
      resetBrand();
      return;
    }
    brandingTimer.current = setTimeout(async () => {
      try {
        const data = await api<PublicBranding>(
          `/public/branding?slug=${encodeURIComponent(slug)}`,
          { auth: false },
        );
        setBranding(data);
        applyBrand({
          primary_color: data.primary_color,
          accent_color: data.accent_color,
        });
      } catch {
        resetBrand();
      }
    }, 350);
    return () => {
      if (brandingTimer.current) clearTimeout(brandingTimer.current);
    };
  }, [slug]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api<TokenResponse>("/auth/login", {
        method: "POST",
        auth: false,
        body: { email, password, tenant_slug: slug || null },
      });
      setSession(data);
      window.localStorage.setItem("cabdesk.lastTenant", data.tenant.slug);
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Could not sign in. Try again.",
      );
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back — enter your workspace details."
      displayName={branding?.display_name ?? branding?.tenant_name ?? "CabDesk"}
      logoUrl={branding?.logo_url}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Workspace"
          hint="The slug from your signup, e.g. demo-cabs"
        >
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value.trim().toLowerCase())}
            placeholder="demo-cabs"
            autoComplete="organization"
            required
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </Field>
        <ErrorBanner message={error} />
        <Button type="submit" loading={loading} className="w-full" size="lg">
          Sign in
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-brand hover:underline">
          Create your workspace
        </Link>
      </p>
    </AuthShell>
  );
}
