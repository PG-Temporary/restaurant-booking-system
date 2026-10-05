"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DateStrip, PartyStepper } from "./SearchControls";

const PRESETS = [
  { id: "any", label: "Any time", from: "", to: "" },
  { id: "lunch", label: "Lunch", from: "12:00", to: "15:00" },
  { id: "early", label: "Early evening", from: "17:00", to: "19:30" },
  { id: "dinner", label: "Dinner", from: "19:00", to: "22:00" },
] as const;

export interface SearchDefaults {
  location: string;
  radiusKm: string;
  date: string;
  partySize: string;
  from: string;
  to: string;
}

export function SearchForm({ defaults, today }: { defaults: SearchDefaults; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(defaults.date);
  const [party, setParty] = useState(Math.max(1, Number(defaults.partySize) || 2));
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const preset = PRESETS.find((p) => p.from === from && p.to === to);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const qs = new URLSearchParams({
      location: String(f.get("location") ?? ""),
      radiusKm: String(f.get("radiusKm") ?? "5"),
      date,
      partySize: String(party),
    });
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    startTransition(() => router.push(`/find?${qs}`));
  }

  return (
    <form className="card searchbar" onSubmit={onSubmit} action="/find" method="get" aria-busy={pending}>
      <label className="span-2">
        Where
        <input name="location" defaultValue={defaults.location} placeholder="City or postcode, e.g. London or E1" required minLength={2} autoComplete="off" enterKeyHint="search" />
      </label>

      <div className="field-group span-2">
        <span className="group-label" id="date-label">When</span>
        <DateStrip min={today} value={date} onChange={setDate} label="Choose a date" recenterOn={pending} />
        <input type="hidden" name="date" value={date} />
      </div>

      <div className="field-group">
        <span className="group-label">Guests</span>
        <PartyStepper value={party} onChange={setParty} />
        <input type="hidden" name="partySize" value={party} />
      </div>

      <label>
        Distance
        <select name="radiusKm" defaultValue={defaults.radiusKm}>
          {[1, 2, 5, 10, 25, 50].map((r) => <option key={r} value={r}>Within {r} km</option>)}
        </select>
      </label>

      <div className="field-group span-2">
        <span className="group-label">Time of day</span>
        <div className="chips" role="group" aria-label="Time of day">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={preset?.id === p.id} onClick={() => { setFrom(p.from); setTo(p.to); }}>{p.label}</button>
          ))}
          {!preset ? <button type="button" className="chip" aria-pressed="true">Custom {from || "00:00"} to {to || "23:59"}</button> : null}
        </div>
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
      </div>

      <div className="cta span-2">
        <button type="submit" className="big" disabled={pending}>{pending ? "Searching…" : "Find tables"}</button>
      </div>
    </form>
  );
}
