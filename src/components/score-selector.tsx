"use client";

import { cn } from "@/components/ui";

/**
 * Two rows of five large buttons (≥52px) with anchor labels. Works one-handed on small phones;
 * no sliders. Fully keyboard accessible (radiogroup semantics).
 */
export function ScoreSelector({
  value,
  onChange,
  min = 1,
  max = 10,
  anchors,
  label,
  disabled,
}: {
  value: number | null;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  anchors: Record<string, string>;
  label: string;
  disabled?: boolean;
}) {
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const half = Math.ceil(values.length / 2);
  const rows = [values.slice(0, half), values.slice(half)];
  const pick = (v: number) => {
    if (disabled) return;
    onChange(v);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(10);
  };
  return (
    <div role="radiogroup" aria-label={label} className="space-y-2">
      {rows.map((row, ri) => (
        <div key={ri} className="grid grid-cols-5 gap-2">
          {row.map((v) => {
            const selected = value === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${v}${anchors[String(v)] ? ` — ${anchors[String(v)]}` : ""}`}
                disabled={disabled}
                onClick={() => pick(v)}
                className={cn(
                  "score-btn rounded-md border text-lg font-bold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan",
                  selected ? "border-accent bg-accent text-black glow" : "border-border bg-bg-panel text-fg hover:border-fg-subtle",
                  disabled && "opacity-60",
                )}
              >
                {v}
              </button>
            );
          })}
        </div>
      ))}
      <div className="flex justify-between text-[11px] text-fg-subtle">
        <span>{min} · {anchors[String(min)]}</span>
        <span>{max} · {anchors[String(max)]}</span>
      </div>
      {value !== null && anchors[String(value)] && (
        <p className="text-center text-xs text-cyan" aria-live="polite">
          {value} — {anchors[String(value)]}
        </p>
      )}
    </div>
  );
}
