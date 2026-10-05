// Timezone helpers built on Intl only (no date library). All instants are UTC
// Dates; "local" values are wall-clock strings in a restaurant's IANA zone.

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTimeString(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Offset (local - UTC) in ms of `tz` at the UTC instant `utcMs`. */
function offsetMs(utcMs: number, tz: string): number {
  const parts = formatter(tz).formatToParts(new Date(Math.floor(utcMs / 1000) * 1000));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Convert a local wall-clock date/time in `tz` to a UTC instant.
 * A time skipped by a DST jump resolves to the instant after the jump; an
 * ambiguous time (clocks back) resolves to the first occurrence.
 */
export function zonedWallTimeToUtc(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wall - offsetMs(wall, tz);
  const corrected = wall - offsetMs(guess, tz);
  if (corrected !== guess) guess = corrected;
  return new Date(guess);
}

export interface LocalParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  dayOfWeek: number; // 0 = Sunday
}

export function utcToLocalParts(instant: Date, tz: string): LocalParts {
  const parts = formatter(tz).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return { date, time: `${get("hour")}:${get("minute")}`, dayOfWeek: dayOfWeekOf(date) };
}

export function dayOfWeekOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** UTC [start, end) covering the whole local calendar day. */
export function localDayRangeUtc(date: string, tz: string): { start: Date; end: Date } {
  return {
    start: zonedWallTimeToUtc(date, "00:00", tz),
    end: zonedWallTimeToUtc(addDays(date, 1), "00:00", tz),
  };
}
