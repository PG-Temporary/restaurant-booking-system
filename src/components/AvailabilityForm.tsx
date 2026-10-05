"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DateStrip, PartyStepper } from "./SearchControls";

/** Changing the day or party size reloads the slots straight away (no extra button). */
export function AvailabilityForm({ slug, date, partySize, today, maxParty }: { slug: string; date: string; partySize: number; today: string; maxParty: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (d: string, p: number) => startTransition(() => router.replace(`/restaurants/${slug}?date=${d}&partySize=${p}`, { scroll: false }));
  return (
    <div className="card grid" aria-busy={pending} style={{ opacity: pending ? 0.7 : 1, transition: "opacity var(--t-fast)" }}>
      <div className="field-group" style={{ display: "grid", gap: 8 }}>
        <span className="group-label">Date</span>
        <DateStrip min={today} value={date} onChange={(d) => go(d, partySize)} />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="group-label">Guests</span>
        <PartyStepper value={partySize} max={maxParty} onChange={(p) => go(date, p)} />
      </div>
    </div>
  );
}
