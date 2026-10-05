"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { utcToLocalParts } from "@/lib/time";

interface Slot { startsAt: string; label: string }

export function ManageReservation(props: {
  code: string;
  email?: string;
  slug: string;
  partySize: number;
  startsAtIso: string;
  timezone: string;
}) {
  const router = useRouter();
  const [date, setDate] = useState(utcToLocalParts(new Date(props.startsAtIso), props.timezone).date);
  const [party, setParty] = useState(props.partySize);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function checkTimes(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const qs = new URLSearchParams({ date, partySize: String(party), excludeCode: props.code });
    const res = await api<{ slots: Slot[] }>(`/api/restaurants/${props.slug}/availability?${qs}`, "GET");
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: res.error ?? "Could not load times." });
    setSlots(res.data!.slots);
  }

  async function choose(startsAt: string) {
    setBusy(true);
    setMsg(null);
    const res = await api(`/api/reservations/${props.code}`, "PATCH", { email: props.email, startsAt, partySize: party });
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: res.error ?? "Could not change booking." });
    setMsg({ kind: "ok", text: "Your booking has been updated." });
    setSlots(null);
    router.refresh();
  }

  async function cancel() {
    if (!window.confirm("Cancel this booking?")) return;
    setBusy(true);
    const res = await api(`/api/reservations/${props.code}/cancel`, "POST", { email: props.email });
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: res.error ?? "Could not cancel." });
    router.refresh();
  }

  return (
    <section>
      <h2>Change or cancel</h2>
      <form className="card row" onSubmit={checkTimes} style={{ alignItems: "flex-end" }}>
        <label>New date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        <label>Party size<input type="number" min={1} max={50} value={party} onChange={(e) => setParty(Number(e.target.value))} required style={{ width: 90 }} /></label>
        <button type="submit" className="secondary" disabled={busy}>Show available times</button>
      </form>
      {slots ? (
        slots.length === 0 ? <p>No tables available then. Try another date or party size.</p> : (
          <div className="slots">
            {slots.map((s) => (
              <button key={s.startsAt} type="button" className="slot" disabled={busy} onClick={() => choose(s.startsAt)}>{s.label}</button>
            ))}
          </div>
        )
      ) : null}
      {msg ? <p className={`alert ${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</p> : null}
      <p><button className="danger" onClick={cancel} disabled={busy}>Cancel booking</button></p>
    </section>
  );
}
