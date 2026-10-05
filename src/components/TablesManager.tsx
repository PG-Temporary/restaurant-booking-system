"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

interface Tbl { id: string; name: string; capacity: number; active: boolean }

export function TablesManager({ tables }: { tables: Tbl[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError("");
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Something went wrong.");
    else router.refresh();
  }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    await run(async () => {
      const res = await api("/api/owner/tables", "POST", { name: f.get("name"), capacity: Number(f.get("capacity")) });
      if (res.ok) form.reset();
      return res;
    });
  }

  return (
    <section>
      {error ? <p className="alert error" role="alert">{error}</p> : null}
      <table className="plain">
        <thead><tr><th>Name</th><th>Seats</th><th>Status</th><th /></tr></thead>
        <tbody>
          {tables.length === 0 ? <tr><td colSpan={4} className="muted">No tables yet. Add your first one below.</td></tr> : null}
          {tables.map((t) => (
            <tr key={t.id} style={{ opacity: t.active ? 1 : 0.55 }}>
              <td data-label="Table">{t.name}</td>
              <td data-label="Seats">
                <input type="number" min={1} max={50} defaultValue={t.capacity} style={{ width: 70 }} aria-label={`Seats for ${t.name}`} disabled={busy}
                  onBlur={(e) => { const v = Number(e.target.value); if (v !== t.capacity && v >= 1) run(() => api(`/api/owner/tables/${t.id}`, "PATCH", { capacity: v })); }} />
              </td>
              <td data-label="Status">{t.active ? "In use" : "Deactivated"}</td>
              <td data-label="">
                <button className="secondary small" disabled={busy} onClick={() => run(() => api(`/api/owner/tables/${t.id}`, "PATCH", { active: !t.active }))}>
                  {t.active ? "Deactivate" : "Reactivate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="row card" onSubmit={add} style={{ marginTop: 12 }}>
        <label>Table name<input name="name" required maxLength={50} placeholder="e.g. Window 2" /></label>
        <label>Seats<input name="capacity" type="number" min={1} max={50} defaultValue={2} required style={{ width: 90 }} /></label>
        <button type="submit" disabled={busy}>Add table</button>
      </form>
    </section>
  );
}
