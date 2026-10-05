"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { formatTime, STATUS_LABEL } from "@/lib/format";

interface Res {
  id: string; confirmationCode: string; status: string; source: string; partySize: number;
  startsAt: string; endsAt: string; guestName: string; guestPhone: string; guestEmail: string; notes: string;
  table: { id: string; name: string; capacity: number };
}
interface Tbl { id: string; name: string; capacity: number }
interface Blk { id: string; tableId: string | null; startsAt: string; endsAt: string; reason: string }

const ACTIONS: Record<string, Array<{ to: string; label: string; cls?: string }>> = {
  CONFIRMED: [{ to: "SEATED", label: "Seat" }, { to: "NO_SHOW", label: "No-show", cls: "secondary" }, { to: "CANCELLED", label: "Cancel", cls: "secondary" }],
  SEATED: [{ to: "COMPLETED", label: "Complete" }],
};

export function DayView({ timezone, tables, reservations, blocks }: { timezone: string; tables: Tbl[]; reservations: Res[]; blocks: Blk[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    setError("");
    const res = await api(`/api/owner/reservations/${id}`, "PATCH", { status });
    setBusyId(null);
    if (!res.ok) setError(res.error ?? "Could not update.");
    router.refresh();
  }

  if (tables.length === 0) return <p className="muted">No active tables yet.</p>;
  const active = reservations.filter((r) => r.status === "CONFIRMED" || r.status === "SEATED");
  const covers = active.reduce((n, r) => n + r.partySize, 0);

  return (
    <section aria-label="Day view">
      <p className="muted small">{active.length} active booking{active.length === 1 ? "" : "s"} · {covers} covers · times in {timezone}</p>
      {error ? <p className="alert error" role="alert">{error}</p> : null}
      <div className="columns">
        {tables.map((t) => {
          const items = [
            ...reservations.filter((r) => r.table.id === t.id).map((r) => ({ kind: "res" as const, at: r.startsAt, r })),
            ...blocks.filter((b) => b.tableId === t.id || b.tableId === null).map((b) => ({ kind: "blk" as const, at: b.startsAt, b })),
          ].sort((a, b) => a.at.localeCompare(b.at));
          return (
            <div className="col" key={t.id}>
              <h3>{t.name} <span className="muted small">· seats {t.capacity}</span></h3>
              {items.length === 0 ? <span className="muted small">Free all day</span> : null}
              {items.map((it) =>
                it.kind === "blk" ? (
                  <div className="res blocked" key={`b${it.b.id}`}>
                    <strong>{formatTime(it.b.startsAt, timezone)}–{formatTime(it.b.endsAt, timezone)} blocked</strong>
                    <span className="small muted">{it.b.reason || "No reason given"}</span>
                  </div>
                ) : (
                  <div className="res" key={it.r.id}>
                    <div>
                      <strong>{formatTime(it.r.startsAt, timezone)}–{formatTime(it.r.endsAt, timezone)}</strong>{" "}
                      <span className={`badge ${it.r.status}`}>{STATUS_LABEL[it.r.status]}</span>
                    </div>
                    <div>{it.r.guestName} · party of {it.r.partySize}</div>
                    <div className="small muted">
                      {it.r.source === "ONLINE" ? "Online" : it.r.source === "PHONE" ? "Phone" : "Walk-in"} · {it.r.confirmationCode}
                      {it.r.guestPhone ? ` · ${it.r.guestPhone}` : ""}
                    </div>
                    {it.r.notes ? <div className="small">“{it.r.notes}”</div> : null}
                    <div className="row" style={{ gap: 6 }}>
                      {(ACTIONS[it.r.status] ?? []).map((a) => (
                        <button key={a.to} className={`small ${a.cls ?? ""}`} disabled={busyId === it.r.id} onClick={() => setStatus(it.r.id, a.to)}>{a.label}</button>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
