"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/client";

type Peek =
  | { reusable: false; personName: string; eventName: string }
  | { reusable: true; personName: string; eventName: string; requiresPin: boolean; group: "JUDGE" | "STAFF" }
  | null;

export function RedeemApp({ token }: { token: string }) {
  const t = useTranslations("evaluator");
  const tc = useTranslations("common");
  const router = useRouter();
  const [peek, setPeek] = useState<Peek | undefined>(undefined);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ peek: Peek }>("/api/evaluator/redeem", { method: "POST", json: { token, confirm: false } })
      .then((r) => setPeek(r.peek))
      .catch(() => setPeek(null));
  }, [token]);

  async function confirm() {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/evaluator/redeem", { method: "POST", json: { token, confirm: true, pin: pin || null } });
      router.replace("/evaluate");
    } catch (e) {
      setErr(e instanceof ApiError && e.details.field === "pin" ? t("pinInvalid") : t("tokenInvalid"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4">
      <Card className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-fg-subtle">Antisocial Live</p>
        {peek === undefined && <p className="mt-4 text-fg-muted">…</p>}
        {peek === null && <Alert tone="danger">{t("tokenInvalid")}</Alert>}
        {peek && !peek.reusable && (
          <div className="mt-4">
            <p className="text-lg">{t("welcome", { name: peek.personName })}</p>
            <Alert tone="warning">{t("tokenInvalid")}</Alert>
            <Button className="mt-4 w-full" variant="secondary" onClick={() => router.replace("/evaluate")}>{tc("continue")}</Button>
          </div>
        )}
        {peek && peek.reusable && (
          <div className="mt-4">
            <h1 className="text-2xl font-bold">{t("welcome", { name: peek.personName })}</h1>
            <p className="mt-1 text-sm text-fg-muted">{peek.eventName} · {peek.group === "JUDGE" ? t("judgePortal") : t("staffPortal")}</p>
            <p className="mt-6 text-lg">{t("confirmIdentity")}</p>
            {peek.requiresPin && <Input className="mt-3 text-center text-2xl tracking-[0.5em]" inputMode="numeric" maxLength={8} placeholder={t("pin")} value={pin} onChange={(e) => setPin(e.target.value)} />}
            {err && <div className="mt-3"><Alert tone="danger">{err}</Alert></div>}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button variant="secondary" size="lg" onClick={() => router.replace("/")}>{t("confirmNo")}</Button>
              <Button size="lg" loading={busy} onClick={confirm}>{t("confirmYes")}</Button>
            </div>
          </div>
        )}
      </Card>
    </main>
  );
}
