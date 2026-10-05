"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { utcToLocalParts, zonedWallTimeToUtc } from "@/lib/time";

export function WalkInForm({ date, timezone, tables, onDone }: { date: string; timezone: string; tables: Array<{ id: string; name: string; capacity: number }>; onDone?: (message: string) => void }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hh, mm] = utcToLocalParts(new Date(), timezone).time.split(":").map(Number);
  const rounded = (Math.round((hh * 60 + mm) / 5) * 5) % (24 * 60); // nearest 5 min, carries into the hour
  const defaultTime = `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setMsg(null);
    const res = await api<{ confirmationCode: string; table: { name: string } }>("/api/owner/reservations", "POST", {
      startsAt: zonedWallTimeToUtc(date, String(f.get("time")), timezone).toISOString(),
      partySize: Number(f.get("partySize")),
      source: f.get("source"),
      guest: { name: f.get("name"), phone: f.get("phone") || undefined, email: f.get("email") || undefined },
      tableId: f.get("tableId") || undefined,
      notes: String(f.get("notes") ?? "") || undefined,
    });
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: res.error ?? "Could not add booking." });
    const text = `Added on table ${res.data!.table.name} (code ${res.data!.confirmationCode}).`;
    form.reset();
    router.refresh();
    if (onDone) return onDone(text);
    setMsg({ kind: "ok", text });
  }

  return (
    <form className="grid" onSubmit={onSubmit}>
      <div className="row">
        <label>Type<select name="source" defaultValue="WALK_IN"><option value="WALK_IN">Walk-in (seated now)</option><option value="PHONE">Phone booking</option></select></label>
        <label>Time<input type="time" name="time" step={300} defaultValue={defaultTime} required /></label>
        <label>Party size<input type="number" name="partySize" min={1} max={50} defaultValue={2} required style={{ width: 90 }} /></label>
        <label>Table
          <select name="tableId" defaultValue="">
            <option value="">Best fit (automatic)</option>
            {tables.map((t) => <option key={t.id} value={t.id}>{t.name} (seats {t.capacity})</option>)}
          </select>
        </label>
      </div>
      <div className="row">
        <label style={{ flex: "2 1 180px" }}>Guest name<input name="name" required maxLength={100} /></label>
        <label>Phone (optional)<input name="phone" maxLength={30} /></label>
        <label>Email (optional)<input type="email" name="email" /></label>
      </div>
      <label>Notes<input name="notes" maxLength={500} /></label>
      {msg ? <p className={`alert ${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</p> : null}
      <div><button type="submit" className="big" disabled={busy}>{busy ? "Adding…" : "Add booking"}</button></div>
    </form>
  );
}
