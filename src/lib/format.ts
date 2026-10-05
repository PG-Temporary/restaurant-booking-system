import { utcToLocalParts } from "./time";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatDateTime(iso: string | Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(iso));
}

export function formatTime(iso: string | Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/** Format a YYYY-MM-DD calendar date (no timezone shift). */
export function formatDateParts(date: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(Date.UTC(y, m - 1, d)));
}

export const formatDateLong = (date: string): string =>
  formatDateParts(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export const todayIn = (tz: string): string => utcToLocalParts(new Date(), tz).date;

export const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmed",
  SEATED: "Seated",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelled",
};
