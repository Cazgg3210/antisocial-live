"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/api/auth/login", { method: "POST", json: { email, password } });
      router.replace(next.startsWith("/") ? next : "/admin");
      router.refresh();
    } catch {
      setErr(t("invalidCredentials"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit}>
        <Field label={t("login") === "Sign in" ? "Email" : "Correo"}>
          <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label={t("password")}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {err && <div className="mb-3"><Alert tone="danger">{err}</Alert></div>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>{t("login")}</Button>
      </form>
    </Card>
  );
}
