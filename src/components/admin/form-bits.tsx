"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert, Button } from "@/components/ui";
import type { ActionResult } from "@/modules/admin/actions";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** Thin wrapper around useActionState that renders the outcome and keeps the form uncontrolled. */
export function ActionForm({ action, children, submitLabel = "Save", className, confirm }: { action: Action; children: React.ReactNode; submitLabel?: string; className?: string; confirm?: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  // Success messages auto-hide after 4 s; the timeout callback (not the effect body) updates state.
  const [hidden, setHidden] = useState<ActionResult | null>(null);
  useEffect(() => {
    if (state?.ok) {
      const id = setTimeout(() => setHidden(state), 4000);
      return () => clearTimeout(id);
    }
  }, [state]);
  const shown = state && state !== hidden ? state : null;
  return (
    <form action={formAction} className={className} onSubmit={(e) => confirm && !window.confirm(confirm) && e.preventDefault()}>
      {children}
      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" loading={pending}>{submitLabel}</Button>
        {shown && !shown.ok && <span className="text-sm text-danger">{shown.error}</span>}
        {shown && shown.ok && <span className="text-sm text-success">{shown.message ?? "OK"}</span>}
        {shown && shown.ok && !!shown.data && typeof shown.data === "object" && "url" in shown.data && (
          <code className="break-all rounded bg-bg px-2 py-1 text-xs">{String((shown.data as { url: string }).url)}</code>
        )}
      </div>
    </form>
  );
}

/** Button that invokes a server action with fixed arguments (no form fields). */
export function ActionButton({ action, children, variant = "secondary", size = "sm", confirm, className }: { action: () => Promise<ActionResult>; children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "outline"; size?: "sm" | "md" | "lg"; confirm?: string; className?: string }) {
  const [pending, setPending] = useState(false);
  const [res, setRes] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant={variant}
        size={size}
        loading={pending}
        className={className}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setPending(true);
          try {
            setRes(await action());
          } finally {
            setPending(false);
          }
        }}
      >
        {children}
      </Button>
      {res && !res.ok && <span className="text-xs text-danger">{res.error}</span>}
      {res && res.ok && !!res.data && typeof res.data === "object" && "url" in res.data && (
        <code className="max-w-xs truncate rounded bg-bg px-2 py-1 text-xs" title={String((res.data as { url: string }).url)}>{String((res.data as { url: string }).url)}</code>
      )}
    </span>
  );
}

export function Notice({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return result.ok ? <Alert tone="success">{result.message ?? "OK"}</Alert> : <Alert tone="danger">{result.error}</Alert>;
}
