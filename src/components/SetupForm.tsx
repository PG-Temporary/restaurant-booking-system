"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { DAY_NAMES } from "@/lib/format";

interface Hours { dayOfWeek: number; opensAt: string; closesAt: string }
export interface SetupInitial {
  name: string; description: string; address: string; city: string; postcode: string;
  latitude: number | null; longitude: number | null; timezone: string;
  slotLengthMinutes: number; slotIntervalMinutes: number; leadTimeMinutes: number; maxPartySize: number;
  openingHours: Hours[];
}

const num = (v: FormDataEntryValue | null) => Number(v);

export function SetupForm({ initial }: { initial: SetupInitial }) {
  const router = useRouter();
  const [hours, setHours] = useState<Hours[]>(initial.openingHours);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<Hours>) => setHours((h) => h.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    const lat = String(f.get("latitude") ?? "").trim();
    const lng = String(f.get("longitude") ?? "").trim();
    const res = await api<{ locationResolved: boolean }>("/api/owner/restaurant", "PUT", {
      name: f.get("name"), description: f.get("description"), address: f.get("address"),
      city: f.get("city"), postcode: f.get("postcode"),
      latitude: lat === "" ? null : Number(lat), longitude: lng === "" ? null : Number(lng),
      timezone: f.get("timezone"),
      slotLengthMinutes: num(f.get("slotLengthMinutes")), slotIntervalMinutes: num(f.get("slotIntervalMinutes")),
      leadTimeMinutes: num(f.get("leadTimeMinutes")), maxPartySize: num(f.get("maxPartySize")),
      openingHours: hours,
    });
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: res.error ?? "Could not save." });
    setMsg(
      res.data!.locationResolved
        ? { kind: "ok", text: "Saved." }
        : { kind: "info", text: "Saved, but we couldn't place your restaurant on the map from that city/postcode. Enter latitude and longitude so diners can find you." },
    );
    router.refresh();
  }

  return (
    <form className="grid" onSubmit={onSubmit}>
      <fieldset className="card grid" style={{ border: "1px solid var(--border)" }}>
        <legend>Details</legend>
        <label>Restaurant name<input name="name" defaultValue={initial.name} required maxLength={120} /></label>
        <label>Description<textarea name="description" rows={2} defaultValue={initial.description} maxLength={2000} /></label>
        <div className="row">
          <label style={{ flex: "2 1 220px" }}>Street address<input name="address" defaultValue={initial.address} maxLength={200} /></label>
          <label>City<input name="city" defaultValue={initial.city} required /></label>
          <label>Postcode<input name="postcode" defaultValue={initial.postcode} required /></label>
        </div>
        <div className="row">
          <label>Latitude (optional)<input name="latitude" type="number" step="any" defaultValue={initial.latitude ?? ""} /></label>
          <label>Longitude (optional)<input name="longitude" type="number" step="any" defaultValue={initial.longitude ?? ""} /></label>
          <label>Timezone (IANA)<input name="timezone" defaultValue={initial.timezone} required list="tzs" /></label>
          <datalist id="tzs">{["Europe/London", "Europe/Dublin", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"].map((z) => <option key={z} value={z} />)}</datalist>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Leave latitude/longitude blank and we&apos;ll place you from your postcode or city.</p>
      </fieldset>

      <fieldset className="card grid" style={{ border: "1px solid var(--border)" }}>
        <legend>Booking rules</legend>
        <div className="row">
          <label>Table hold time (minutes)<input name="slotLengthMinutes" type="number" min={15} max={480} step={5} defaultValue={initial.slotLengthMinutes} required /></label>
          <label>Booking time steps (minutes)<input name="slotIntervalMinutes" type="number" min={5} max={240} step={5} defaultValue={initial.slotIntervalMinutes} required /></label>
          <label>Minimum notice (minutes)<input name="leadTimeMinutes" type="number" min={0} step={5} defaultValue={initial.leadTimeMinutes} required /></label>
          <label>Largest online party<input name="maxPartySize" type="number" min={1} max={50} defaultValue={initial.maxPartySize} required /></label>
        </div>
      </fieldset>

      <fieldset className="card grid" style={{ border: "1px solid var(--border)" }}>
        <legend>Opening hours</legend>
        <p className="muted small" style={{ margin: 0 }}>Add several windows for a day to model lunch and dinner. Overnight service isn&apos;t supported yet - close by 23:59.</p>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div key={d} className="row" style={{ alignItems: "center" }}>
            <strong style={{ width: 100 }}>{DAY_NAMES[d]}</strong>
            {hours.every((h) => h.dayOfWeek !== d) ? <span className="muted">Closed</span> : null}
            {hours.map((h, i) =>
              h.dayOfWeek !== d ? null : (
                <span key={i} className="row" style={{ alignItems: "center", gap: 6 }}>
                  <input type="time" value={h.opensAt} onChange={(e) => update(i, { opensAt: e.target.value })} aria-label={`${DAY_NAMES[d]} opens`} required />
                  –
                  <input type="time" value={h.closesAt} onChange={(e) => update(i, { closesAt: e.target.value })} aria-label={`${DAY_NAMES[d]} closes`} required />
                  <button type="button" className="secondary small" onClick={() => setHours((x) => x.filter((_, j) => j !== i))} aria-label={`Remove ${DAY_NAMES[d]} window`}>✕</button>
                </span>
              ),
            )}
            <button type="button" className="secondary small" onClick={() => setHours((x) => [...x, { dayOfWeek: d, opensAt: "17:00", closesAt: "22:00" }])}>+ Add hours</button>
          </div>
        ))}
      </fieldset>

      {msg ? <p className={`alert ${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</p> : null}
      <div><button type="submit" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button></div>
    </form>
  );
}
