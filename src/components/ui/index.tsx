import * as React from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
type ButtonSize = "sm" | "md" | "lg" | "xl";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-black hover:brightness-110 focus-visible:ring-accent",
  secondary: "bg-bg-panel text-fg border border-border hover:border-fg-subtle focus-visible:ring-cyan",
  ghost: "bg-transparent text-fg-muted hover:text-fg hover:bg-bg-panel",
  danger: "bg-danger text-black hover:brightness-110 focus-visible:ring-danger",
  success: "bg-success text-black hover:brightness-110 focus-visible:ring-success",
  outline: "bg-transparent border border-accent text-accent hover:bg-accent/10",
};
const SIZE: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-13 px-6 text-base",
  xl: "h-16 px-8 text-lg font-bold tracking-wide",
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }
>(function Button({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:cursor-not-allowed select-none",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
});

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-lg border border-border bg-bg-elevated p-5", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h2 className={cn("mb-3 text-sm font-semibold uppercase tracking-wider text-fg-muted", className)}>{children}</h2>;
}

type BadgeTone = "neutral" | "accent" | "cyan" | "acid" | "yellow" | "danger" | "success" | "warning";
const TONE: Record<BadgeTone, string> = {
  neutral: "bg-bg-panel text-fg-muted border-border",
  accent: "bg-accent/15 text-accent border-accent/40",
  cyan: "bg-cyan/15 text-cyan border-cyan/40",
  acid: "bg-acid/15 text-acid border-acid/40",
  yellow: "bg-yellow/15 text-yellow border-yellow/40",
  danger: "bg-danger/15 text-danger border-danger/40",
  success: "bg-success/15 text-success border-success/40",
  warning: "bg-warning/15 text-warning border-warning/40",
};
export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", TONE[tone], className)}>
      {children}
    </span>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-md border border-border bg-bg px-3 text-fg placeholder:text-fg-subtle focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/30",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-24 w-full rounded-md border border-border bg-bg px-3 py-2 text-fg placeholder:text-fg-subtle focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/30",
        className,
      )}
      {...props}
    />
  );
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn("h-11 w-full rounded-md border border-border bg-bg px-3 text-fg focus:border-cyan focus:outline-none", className)}
      {...props}
    >
      {children}
    </select>
  );
});

export function Label({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-sm font-medium text-fg-muted", className)}>
      {children}
    </label>
  );
}

export function Field({ label, children, hint, error }: { label: string; children: React.ReactNode; hint?: string; error?: string }) {
  return (
    <div className="mb-4">
      <Label>{label}</Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Alert({ tone = "warning", children }: { tone?: "warning" | "danger" | "success" | "info"; children: React.ReactNode }) {
  const map = {
    warning: "border-warning/40 bg-warning/10 text-warning",
    danger: "border-danger/40 bg-danger/10 text-danger",
    success: "border-success/40 bg-success/10 text-success",
    info: "border-cyan/40 bg-cyan/10 text-cyan",
  };
  return (
    <div role="alert" className={cn("rounded-md border px-4 py-3 text-sm", map[tone])}>
      {children}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: BadgeTone }) {
  const color = tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-fg";
  return (
    <div className="rounded-md border border-border bg-bg-panel px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", color)}>{value}</div>
    </div>
  );
}

export function Traffic({ state, label }: { state: "ok" | "warn" | "bad" | "off"; label: string }) {
  const c = { ok: "bg-success", warn: "bg-warning", bad: "bg-danger", off: "bg-fg-subtle" }[state];
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cn("h-3 w-3 rounded-full", c)} aria-hidden />
      <span>{label}</span>
    </div>
  );
}
