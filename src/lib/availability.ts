// Pure availability engine. No I/O: everything it needs is passed in, which is
// what makes it unit-testable. Availability is ALWAYS derived from tables,
// opening hours, reservations and blocks - never stored as a counter.
import { dayOfWeekOf, timeToMinutes, zonedWallTimeToUtc } from "./time.ts";

export interface TableInfo {
  id: string;
  capacity: number;
}

/** An ACTIVE (CONFIRMED / SEATED) reservation occupying a table. */
export interface BusyReservation {
  id: string;
  tableId: string;
  startsAt: Date;
  endsAt: Date;
}

/** tableId === null blocks the whole restaurant. */
export interface BlockInfo {
  tableId: string | null;
  startsAt: Date;
  endsAt: Date;
}

export interface HoursInfo {
  dayOfWeek: number;
  opensAt: string; // HH:mm local
  closesAt: string; // HH:mm local
}

export interface Slot {
  startsAt: Date;
  endsAt: Date;
  /** Best-fit (smallest sufficient) free table for this slot. */
  tableId: string;
}

/** Half-open interval overlap, matching the database's [start, end) ranges. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export interface FreeTableQuery {
  tables: TableInfo[];
  reservations: BusyReservation[];
  blocks: BlockInfo[];
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  /** Ignore this reservation (used when modifying it). */
  excludeReservationId?: string;
  /** Use this table if it is free and big enough, otherwise fall back to best fit. */
  preferTableId?: string;
}

function tableIsFree(t: TableInfo, q: FreeTableQuery): boolean {
  for (const b of q.blocks) {
    if ((b.tableId === null || b.tableId === t.id) && overlaps(q.startsAt, q.endsAt, b.startsAt, b.endsAt)) {
      return false;
    }
  }
  for (const r of q.reservations) {
    if (r.id === q.excludeReservationId) continue;
    if (r.tableId === t.id && overlaps(q.startsAt, q.endsAt, r.startsAt, r.endsAt)) return false;
  }
  return true;
}

/** Smallest free table that fits the party (stable tie-break on id). */
export function findFreeTable(q: FreeTableQuery): TableInfo | null {
  const fits = q.tables.filter((t) => t.capacity >= q.partySize && tableIsFree(t, q));
  if (fits.length === 0) return null;
  if (q.preferTableId) {
    const preferred = fits.find((t) => t.id === q.preferTableId);
    if (preferred) return preferred;
  }
  fits.sort((a, b) => a.capacity - b.capacity || (a.id < b.id ? -1 : 1));
  return fits[0];
}

export interface SlotQuery {
  /** Local calendar date in the restaurant's timezone, YYYY-MM-DD. */
  date: string;
  timezone: string;
  hours: HoursInfo[];
  tables: TableInfo[];
  reservations: BusyReservation[];
  blocks: BlockInfo[];
  slotLengthMinutes: number;
  slotIntervalMinutes: number;
  leadTimeMinutes: number;
  maxPartySize: number;
  partySize: number;
  now: Date;
  excludeReservationId?: string;
  /** Optional local-time filter on slot START times, inclusive. */
  window?: { from?: string; to?: string };
}

export function generateSlots(q: SlotQuery): Slot[] {
  if (q.partySize < 1 || q.partySize > q.maxPartySize) return [];
  if (q.slotLengthMinutes < 1 || q.slotIntervalMinutes < 1) return [];

  const earliest = q.now.getTime() + q.leadTimeMinutes * 60_000;
  const dow = dayOfWeekOf(q.date);
  const from = q.window?.from ? timeToMinutes(q.window.from) : 0;
  const to = q.window?.to ? timeToMinutes(q.window.to) : 24 * 60;
  const byStart = new Map<number, Slot>();

  for (const h of q.hours) {
    if (h.dayOfWeek !== dow) continue;
    const open = timeToMinutes(h.opensAt);
    const close = timeToMinutes(h.closesAt);
    for (let m = open; m + q.slotLengthMinutes <= close; m += q.slotIntervalMinutes) {
      if (m < from || m > to) continue;
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      const startsAt = zonedWallTimeToUtc(q.date, `${hh}:${mm}`, q.timezone);
      if (startsAt.getTime() < earliest) continue;
      if (byStart.has(startsAt.getTime())) continue;
      const endsAt = new Date(startsAt.getTime() + q.slotLengthMinutes * 60_000);
      const table = findFreeTable({
        tables: q.tables,
        reservations: q.reservations,
        blocks: q.blocks,
        startsAt,
        endsAt,
        partySize: q.partySize,
        excludeReservationId: q.excludeReservationId,
      });
      if (table) byStart.set(startsAt.getTime(), { startsAt, endsAt, tableId: table.id });
    }
  }
  return [...byStart.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
