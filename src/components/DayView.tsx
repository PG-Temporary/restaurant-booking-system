"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { formatTime, STATUS_LABEL } from "@/lib/format";
import { utcToLocalParts } from "@/lib/time";
import { WalkInForm } from "./WalkInForm";

interface Res {
  id: string; confirmationCode: string; status: string; source: string; partySize: number;
  startsAt: string; endsAt: string; guestName: string; guestPhone: string; guestEmail: string; notes: string;
  table: { id: string; name: string; capacity: number };
}
interface Tbl { id: string; name: string; capacity: number }
interface Blk { id: string; tableId: string | null; startsAt: string; endsAt: string; reason: string }
interface Hours { opensAt: string; closesAt: string }

const PPM = 1.6; // pixels per minute on the time axis
const NEXT: Record<string, Array<{ to: string; label: string; cls?: string }>> = {
  CONFIRMED: [{ to: "SEATED", label: "Seat" }, { to: "NO_SHOW", label: "No-show", cls: "secondary" }, { to: "CANCELLED", label: "Cancel", cls: "danger" }],
  SEATED: [{ to: "COMPLETED", label: "Complete" }],
};
const SOURCE: Record<string, string> = { ONLINE: "Online", PHONE: "Phone", WALK_IN: "Walk-in" };
const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

export function DayView(props: { date: string; today: string; timezone: string; tables: Tbl[]; reservations: Res[]; blocks: Blk[]; hours: Hours[] }) {
  const { date, timezone, tables, blocks, hours } = props;
  const router = useRouter();
  const [items, setItems] = useState(props.reservations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const lastSelected = useRef<Res | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const addRef = useRef<HTMLElement>(null);

  useEffect(() => setItems(props.reservations), [props.reservations]);

  const localMin = useCallback((iso: string) => { const [h, m] = utcToLocalParts(new Date(iso), timezone).time.split(":").map(Number); return h * 60 + m; }, [timezone]);
  const range = useMemo(() => {
    let start = hours.length ? Math.min(...hours.map((h) => hm(h.opensAt))) : 12 * 60;
    let end = hours.length ? Math.max(...hours.map((h) => hm(h.closesAt))) : 23 * 60;
    for (const r of items) {
      start = Math.min(start, localMin(r.startsAt));
      end = Math.max(end, Math.min(localMin(r.endsAt) || 24 * 60, 24 * 60));
    }
    start = Math.floor(start / 60) * 60;
    end = Math.ceil(end / 60) * 60;
    if (end - start < 4 * 60) end = Math.min(24 * 60, start + 4 * 60);
    return { start, end };
  }, [hours, items, localMin]);
  const width = (range.end - range.start) * PPM;
  const hourMarks = Array.from({ length: (range.end - range.start) / 60 + 1 }, (_, i) => range.start + i * 60);

  useEffect(() => {
    if (date !== props.today) return setNowMin(null);
    const tick = () => { const [h, m] = utcToLocalParts(new Date(), timezone).time.split(":").map(Number); setNowMin(h * 60 + m); };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [date, props.today, timezone]);

  const selected = items.find((r) => r.id === selectedId) ?? null;
  if (selected) lastSelected.current = selected;
  const shown = selected ?? lastSelected.current;
  const open = selectedId !== null || adding;

  // Escape closes; focus moves into the panel when it opens.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setSelectedId(null); setAdding(false); } };
    window.addEventListener("keydown", onKey);
    (selectedId ? panelRef.current : addRef.current)?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selectedId]);

  const flash = (text: string, kind: "ok" | "error" = "ok") => {
    setToast({ text, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  };

  async function setStatus(id: string, status: string) {
    const previous = items;
    setItems((list) => list.map((r) => (r.id === id ? { ...r, status } : r))); // optimistic
    setPulseId(id);
    window.setTimeout(() => setPulseId(null), 900);
    const res = await api(`/api/owner/reservations/${id}`, "PATCH", { status });
    if (!res.ok) {
      setItems(previous);
      return flash(res.error ?? "Could not update that booking.", "error");
    }
    flash(`Marked ${STATUS_LABEL[status].toLowerCase()}`);
    router.refresh();
  }

  if (tables.length === 0) {
    return (
      <div className="card empty">
        <h2>No tables yet</h2>
        <p className="muted">Add at least one table so diners can book you.</p>
        <div><Link className="btn" href="/dashboard/setup">Add tables</Link></div>
      </div>
    );
  }

  const active = items.filter((r) => r.status === "CONFIRMED" || r.status === "SEATED");
  const covers = active.reduce((n, r) => n + r.partySize, 0);
  // Live bookings in time order; cancelled ones sink to the bottom so they never crowd the host's list.
  const agenda = [...items].sort((a, b) => Number(a.status === "CANCELLED") - Number(b.status === "CANCELLED") || a.startsAt.localeCompare(b.startsAt));
  const label = (r: Res) => `${formatTime(r.startsAt, timezone)} to ${formatTime(r.endsAt, timezone)}, ${r.guestName}, party of ${r.partySize}, ${STATUS_LABEL[r.status]}`;

  return (
    <section aria-label="Day view">
      <div className="stats">
        <div className="card stat"><small>Upcoming</small><strong>{items.filter((r) => r.status === "CONFIRMED").length}</strong></div>
        <div className="card stat"><small>Seated</small><strong>{items.filter((r) => r.status === "SEATED").length}</strong></div>
        <div className="card stat"><small>Covers</small><strong>{covers}</strong></div>
        <div className="stat-cta">
          <button type="button" className="big" onClick={() => { setSelectedId(null); setAdding(true); }}>New booking</button>
        </div>
      </div>

      {/* Tablet / desktop: table lanes along a time axis */}
      <div className="card tl">
        <div className="tl-scroll" tabIndex={0} aria-label="Timeline, scrolls sideways">
          <div className="tl-inner" style={{ width: 112 + width }}>
            <div className="tl-axis">
              <div className="tl-label"><small>{timezone}</small></div>
              <div className="tl-axis-track" style={{ width }}>
                {hourMarks.map((m) => (
                  <div key={m} className="tl-hour" style={{ left: (m - range.start) * PPM }}>{String(Math.floor(m / 60) % 24).padStart(2, "0")}:00</div>
                ))}
              </div>
            </div>
            {tables.map((t) => (
              <div className="tl-lane" key={t.id}>
                <div className="tl-label"><strong>{t.name}</strong><small>seats {t.capacity}</small></div>
                <div className="tl-track" style={{ width }}>
                  {hourMarks.map((m) => <div key={m} className="tl-grid" style={{ left: (m - range.start) * PPM }} />)}
                  {blocks.filter((b) => b.tableId === t.id || b.tableId === null).map((b) => {
                    const s = Math.max(localMin(b.startsAt), range.start);
                    const e = Math.min(localMin(b.endsAt) || 24 * 60, range.end);
                    const wholeDay = new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime() >= 23 * 3600_000;
                    const from = wholeDay ? range.start : s;
                    const to = wholeDay ? range.end : e;
                    return to > from ? (
                      <div key={b.id} className="tl-hatch" style={{ left: (from - range.start) * PPM, width: (to - from) * PPM }}>
                        Closed{b.reason ? `: ${b.reason}` : ""}
                      </div>
                    ) : null;
                  })}
                  {items.filter((r) => r.table.id === t.id).map((r) => {
                    const s = localMin(r.startsAt);
                    const e = localMin(r.endsAt) || 24 * 60;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`tl-block ${r.status}${pulseId === r.id ? " pulse" : ""}`}
                        style={{ left: (s - range.start) * PPM, width: Math.max((e - s) * PPM - 4, 56), opacity: r.status === "CANCELLED" ? 0.5 : 1 }}
                        aria-pressed={selectedId === r.id}
                        aria-label={label(r)}
                        onClick={() => { setAdding(false); setSelectedId(r.id); }}
                      >
                        <b>{r.guestName}</b>
                        <span>{r.partySize} guests, {STATUS_LABEL[r.status]}</span>
                      </button>
                    );
                  })}
                  {nowMin !== null && nowMin >= range.start && nowMin <= range.end ? <div className="tl-now" style={{ left: (nowMin - range.start) * PPM }} /> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Phone fallback: chronological agenda */}
      <div className="agenda" aria-label="Bookings in time order">
        {blocks.map((b) => (
          <div key={b.id} className="card small">Closed {formatTime(b.startsAt, timezone)} to {formatTime(b.endsAt, timezone)}{b.reason ? `: ${b.reason}` : ""}</div>
        ))}
        {agenda.length === 0 ? <div className="card empty"><h3>No bookings this day</h3><p className="muted">Use New booking to add a walk-in or phone booking.</p></div> : null}
        {agenda.map((r) => (
          <button key={r.id} type="button" className={`agenda-item ${r.status}`} onClick={() => { setAdding(false); setSelectedId(r.id); }} aria-label={label(r)}>
            <time>{formatTime(r.startsAt, timezone)}</time>
            <span><strong>{r.guestName}</strong><br /><span className="muted small">{r.partySize} guests, table {r.table.name}</span></span>
            <span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
          </button>
        ))}
      </div>

      <div className="scrim" data-open={open} onClick={() => { setSelectedId(null); setAdding(false); }} />

      <aside ref={panelRef} tabIndex={-1} className="slideover" data-open={selectedId !== null} inert={selectedId === null} role="dialog" aria-label="Booking details">
        {shown ? (
          <>
            <div className="so-head">
              <div>
                <span className={`badge ${shown.status}`}>{STATUS_LABEL[shown.status]}</span>
                <h2 style={{ margin: "10px 0 0" }}>{shown.guestName}</h2>
              </div>
              <button type="button" className="secondary small" onClick={() => setSelectedId(null)}>Close</button>
            </div>
            <dl className="detail-list">
              <div><dt>Time</dt><dd>{formatTime(shown.startsAt, timezone)} to {formatTime(shown.endsAt, timezone)}</dd></div>
              <div><dt>Party</dt><dd>{shown.partySize} guests on table {shown.table.name} (seats {shown.table.capacity})</dd></div>
              <div><dt>Booked via</dt><dd>{SOURCE[shown.source] ?? shown.source}, code {shown.confirmationCode}</dd></div>
              {shown.guestPhone ? <div><dt>Phone</dt><dd><a href={`tel:${shown.guestPhone}`}>{shown.guestPhone}</a></dd></div> : null}
              {shown.guestEmail ? <div><dt>Email</dt><dd>{shown.guestEmail}</dd></div> : null}
              {shown.notes ? <div><dt>Notes</dt><dd>{shown.notes}</dd></div> : null}
            </dl>
            <div className="so-actions">
              {(NEXT[shown.status] ?? []).map((a) => (
                <button key={a.to} type="button" className={a.cls} onClick={() => setStatus(shown.id, a.to)}>{a.label}</button>
              ))}
              {(NEXT[shown.status] ?? []).length === 0 ? <p className="muted" style={{ gridColumn: "1 / -1" }}>This booking is {STATUS_LABEL[shown.status].toLowerCase()}, so there is nothing more to do.</p> : null}
            </div>
          </>
        ) : null}
      </aside>

      <aside ref={addRef} tabIndex={-1} className="slideover" data-open={adding} inert={!adding} role="dialog" aria-label="New booking">
        <div className="so-head">
          <h2 style={{ margin: 0 }}>New booking</h2>
          <button type="button" className="secondary small" onClick={() => setAdding(false)}>Close</button>
        </div>
        {adding ? <WalkInForm date={date} timezone={timezone} tables={tables} onDone={(msg) => { setAdding(false); flash(msg); }} /> : null}
      </aside>

      {toast ? <div className="toast" role="status" aria-live="polite" data-kind={toast.kind}>{toast.text}</div> : null}
    </section>
  );
}
