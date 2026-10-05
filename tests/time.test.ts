import { describe, expect, it } from "vitest";
import { addDays, dayOfWeekOf, isValidDateString, localDayRangeUtc, utcToLocalParts, zonedWallTimeToUtc } from "@/lib/time";

describe("timezone conversion", () => {
  it("converts London summer time (BST, UTC+1) to UTC", () => {
    expect(zonedWallTimeToUtc("2026-07-01", "19:00", "Europe/London").toISOString()).toBe("2026-07-01T18:00:00.000Z");
  });
  it("converts London winter time (GMT, UTC+0) to UTC", () => {
    expect(zonedWallTimeToUtc("2026-01-15", "19:00", "Europe/London").toISOString()).toBe("2026-01-15T19:00:00.000Z");
  });
  it("handles zones behind UTC", () => {
    expect(zonedWallTimeToUtc("2026-07-01", "19:00", "America/New_York").toISOString()).toBe("2026-07-01T23:00:00.000Z");
  });
  it("round-trips through utcToLocalParts", () => {
    const d = zonedWallTimeToUtc("2026-03-28", "20:30", "Europe/London");
    expect(utcToLocalParts(d, "Europe/London")).toEqual({ date: "2026-03-28", time: "20:30", dayOfWeek: 6 });
  });
  it("uses the correct offset on the spring-forward day (2026-03-29 in London)", () => {
    // 00:30 is still GMT, 12:00 is BST.
    expect(zonedWallTimeToUtc("2026-03-29", "00:30", "Europe/London").toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(zonedWallTimeToUtc("2026-03-29", "12:00", "Europe/London").toISOString()).toBe("2026-03-29T11:00:00.000Z");
  });
  it("a local day is 23h on spring-forward and 25h on fall-back", () => {
    const spring = localDayRangeUtc("2026-03-29", "Europe/London");
    expect((spring.end.getTime() - spring.start.getTime()) / 3600_000).toBe(23);
    const fall = localDayRangeUtc("2026-10-25", "Europe/London");
    expect((fall.end.getTime() - fall.start.getTime()) / 3600_000).toBe(25);
  });
  it("shares a UTC instant across zones but not a local date", () => {
    const instant = new Date("2026-07-01T23:30:00Z");
    expect(utcToLocalParts(instant, "Europe/London").date).toBe("2026-07-02");
    expect(utcToLocalParts(instant, "America/New_York").date).toBe("2026-07-01");
  });
});

describe("date helpers", () => {
  it("validates calendar dates", () => {
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("26-02-28")).toBe(false);
  });
  it("adds days across month ends and computes weekday", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayOfWeekOf("2026-10-05")).toBe(1); // Monday
  });
});
