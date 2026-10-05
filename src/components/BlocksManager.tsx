"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { zonedWallTimeToUtc } from "@/lib/time";

interface Blk { id: string; tableName: string | null; startsAt: string; endsAt: string; reason: string }

export function BlocksManager(props: { timezone: string; today: string; tables: Array<{ id: string; name: string }>; blocks: Blk[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [wholeDay, setWholeDay] = useState(true);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const date = String(f.get("date"));
    setBusy(true);
    setMsg(null);
    const res = await api("/api/owner/blocks", "POST", {
      tableId: f.get("tableId") || null,
      reason: f.get("reason"),
      ...(wholeDay
        ? { date }
        : {
            startsAt: zonedWallTimeToUtc(date, String(f.get("from")), props.timezone).toISOString(),
            endsAt: zonedWallTimeToUtc(date, String(f.get("to")), props.timezone).toISOString(),
          }),
    });
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: res.error ?? "Could not add block." });
    setMsg({ kind: "ok", text: "Block added." });
    form.reset();
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await api(`/api/owner/blocks/${id}`, "DELETE");
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: res.error ?? "Could not remove." });
    router.refresh();
  }

  return (
    <section>
      <form className="card grid" onSubmit={add}>
        <div className="row">
          <label>Date<input type="date" name="date" min={props.today} defaultValue={props.today} required /></label>
          <label>Applies to
            <select name="tableId" defaultValue="">
              <option value="">Whole restaurant</option>
              {props.tables.map((t) => <option key={t.id} value={t.id}>Table {t.name}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "row", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={wholeDay} onChange={(e) => setWholeDay(e.target.checked)} /> Whole day
          </label>
          {!wholeDay ? (
            <>
              <label>From<input type="time" name="from" defaultValue="12:00" required /></label>
              <label>To<input type="time" name="to" defaultValue="15:00" required /></label>
            </>
          ) : null}
          <label style={{ flex: "2 1 180px" }}>Reason (optional)<input name="reason" maxLength={200} placeholder="Private event, maintenance…" /></label>
          <button type="submit" disabled={busy}>Add block</button>
        </div>
      </form>
      {msg ? (
        <p className={`alert ${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</p>
      ) : null}
      <h2>Upcoming blocks</h2>
      {props.blocks.length === 0 ? <p className="muted">Nothing blocked.</p> : (
        <table className="plain">
          <thead><tr><th>From</th><th>To</th><th>Applies to</th><th>Reason</th><th /></tr></thead>
          <tbody>
            {props.blocks.map((b) => (
              <tr key={b.id}>
                <td>{formatDateTime(b.startsAt, props.timezone)}</td>
                <td>{formatDateTime(b.endsAt, props.timezone)}</td>
                <td>{b.tableName ? `Table ${b.tableName}` : "Whole restaurant"}</td>
                <td>{b.reason || "—"}</td>
                <td><button className="secondary small" disabled={busy} onClick={() => remove(b.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
