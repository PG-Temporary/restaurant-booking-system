"use client";
import { useEffect, useMemo, useRef } from "react";
import { formatDateParts } from "@/lib/format";
import { addDays } from "@/lib/time";

const fmt = (opts: Intl.DateTimeFormatOptions, date: string) => formatDateParts(date, opts);

/** Horizontal, swipeable strip of days. `min` is the first selectable day (the restaurant's "today"). */
export function DateStrip({ min, value, onChange, days = 21, label = "Date", recenterOn }: { min: string; value: string; onChange: (v: string) => void; days?: number; label?: string; recenterOn?: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const dates = useMemo(() => {
    const list = Array.from({ length: days }, (_, i) => addDays(min, i));
    if (value && !list.includes(value)) list.push(value);
    return list.sort();
  }, [min, value, days]);

  // Keep the selected day in view: on mount, when it changes (a tapped chip glides to the centre),
  // and whenever the parent signals a refresh (e.g. a finished search after keyboard-tabbing the strip).
  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: "center", block: "nearest", behavior: calm ? "auto" : "smooth" });
  }, [value, recenterOn]);

  return (
    <div className="datestrip" ref={ref} role="group" aria-label={label}>
      {dates.map((d) => (
        <button
          key={d}
          type="button"
          className="dchip"
          aria-pressed={d === value}
          aria-label={fmt({ weekday: "long", day: "numeric", month: "long" }, d)}
          onClick={() => onChange(d)}
        >
          <small>{d === min ? "Today" : fmt({ weekday: "short" }, d)}</small>
          <strong>{fmt({ day: "numeric" }, d)}</strong>
          <small>{fmt({ month: "short" }, d)}</small>
        </button>
      ))}
    </div>
  );
}

export function PartyStepper({ value, onChange, min = 1, max = 20, label = "Party size" }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label?: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="secondary" aria-label="Fewer guests" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <output aria-live="polite" aria-label={`${value} guests`}>{value}</output>
      <button type="button" className="secondary" aria-label="More guests" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}
