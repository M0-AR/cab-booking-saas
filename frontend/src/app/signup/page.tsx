"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/AuthShell";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { ApiError, getAccessToken, setSession } from "@/lib/session";
import type { TokenResponse } from "@/lib/types";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function SignupPage() {
  const router = useRouter();
  const [tenantName, setTenantName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getAccessToken()) router.replace("/dashboard");
  }, [router]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(tenantName));
  }, [tenantName, slugTouched]);

  const slugValid = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug);
  const passwordValid = password.length >= 8;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!slugValid) {
      setError("Workspace slug must be 3–40 lowercase letters, digits or dashes.");
      return;
    }
    setLoading(true);
    try {
      const data = await api<TokenResponse>("/auth/signup", {
        method: "POST",
        auth: false,
        body: {
          tenant_name: tenantName,
          slug,
          full_name: fullName,
          email,
          password,
        },
      });
      setSession(data);
      window.localStorage.setItem("cabdesk.lastTenant", data.tenant.slug);
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Could not create your workspace. Try again.",
      );
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Free to start — your fleet data stays yours."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Company name">
          <Input
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            placeholder="Acme Cabs"
            autoComplete="organization"
            required
            minLength={2}
          />
        </Field>
        <Field
          label="Workspace slug"
          hint={
            slug
              ? slugValid
                ? `Your sign-in workspace: ${slug}`
                : "Use 3–40 lowercase letters, digits or dashes."
              : "Shown on the sign-in page, e.g. demo-cabs"
          }
        >
          <Input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.trim().toLowerCase());
            }}
            placeholder="acme-cabs"
            autoComplete="off"
            required
          />
        </Field>
        <Field label="Your name">
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            autoComplete="name"
            required
            minLength={2}
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
        <Field
          label="Password"
          hint={
            password && !passwordValid ? "At least 8 characters." : undefined
          }
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>
        <ErrorBanner message={error} />
        <Button
          type="submit"
          loading={loading}
          disabled={!slugValid || !passwordValid}
          className="w-full"
          size="lg"
        >
          Create workspace
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Already have a workspace?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
