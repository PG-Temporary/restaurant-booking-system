import { describe, expect, it } from "vitest";
import { findFreeTable, generateSlots, overlaps, type SlotQuery } from "@/lib/availability";
import { zonedWallTimeToUtc } from "@/lib/time";

const TZ = "Europe/London";
const DATE = "2026-07-03"; // Friday, BST
const at = (hhmm: string, date = DATE) => zonedWallTimeToUtc(date, hhmm, TZ);

const base = (over: Partial<SlotQuery> = {}): SlotQuery => ({
  date: DATE,
  timezone: TZ,
  hours: [{ dayOfWeek: 5, opensAt: "18:00", closesAt: "21:00" }],
  tables: [
    { id: "t2", capacity: 2 },
    { id: "t4", capacity: 4 },
  ],
  reservations: [],
  blocks: [],
  slotLengthMinutes: 90,
  slotIntervalMinutes: 30,
  leadTimeMinutes: 60,
  maxPartySize: 8,
  partySize: 2,
  now: at("09:00"),
  ...over,
});

const starts = (q: SlotQuery) => generateSlots(q).map((s) => s.startsAt.toISOString());

describe("generateSlots", () => {
  it("lists start times so the full slot fits before closing", () => {
    // 18:00..19:30 (a 19:30 start ends at 21:00 exactly), local BST = UTC-1h
    expect(starts(base())).toEqual(["18:00", "18:30", "19:00", "19:30"].map((t) => at(t).toISOString()));
  });

  it("returns nothing on a closed day", () => {
    expect(generateSlots(base({ date: "2026-07-04" }))).toEqual([]); // Saturday: no hours
  });

  it("supports split services (lunch + dinner) without duplicates", () => {
    const q = base({
      hours: [
        { dayOfWeek: 5, opensAt: "12:00", closesAt: "14:00" },
        { dayOfWeek: 5, opensAt: "18:00", closesAt: "19:30" },
      ],
    });
    expect(starts(q)).toEqual(["12:00", "12:30", "18:00"].map((t) => at(t).toISOString()));
  });

  it("applies the lead-time cutoff", () => {
    const q = base({ now: at("18:00"), leadTimeMinutes: 60 });
    expect(starts(q)).toEqual(["19:00", "19:30"].map((t) => at(t).toISOString()));
  });

  it("rejects parties above the max party size or with no big-enough table", () => {
    expect(generateSlots(base({ partySize: 9 }))).toEqual([]);
    expect(generateSlots(base({ partySize: 6, maxPartySize: 8 }))).toEqual([]); // largest table seats 4
  });

  it("assigns the smallest table that fits", () => {
    const slots = generateSlots(base({ partySize: 2 }));
    expect(slots.every((s) => s.tableId === "t2")).toBe(true);
    expect(generateSlots(base({ partySize: 3 })).every((s) => s.tableId === "t4")).toBe(true);
  });

  it("removes a slot once the only suitable table is taken, and reopens it after the booking ends", () => {
    const q = base({
      tables: [{ id: "t4", capacity: 4 }],
      partySize: 4,
      reservations: [{ id: "r1", tableId: "t4", startsAt: at("18:00"), endsAt: at("19:30") }],
    });
    // 18:00, 18:30, 19:00 overlap [18:00,19:30); 19:30 does not (half-open).
    expect(starts(q)).toEqual([at("19:30").toISOString()]);
  });

  it("falls back to a larger table when the small one is busy", () => {
    const q = base({
      partySize: 2,
      reservations: [{ id: "r1", tableId: "t2", startsAt: at("18:00"), endsAt: at("19:30") }],
    });
    const first = generateSlots(q)[0];
    expect(first.startsAt.toISOString()).toBe(at("18:00").toISOString());
    expect(first.tableId).toBe("t4");
  });

  it("honours table blocks and whole-restaurant blocks", () => {
    const tableBlock = base({
      tables: [{ id: "t4", capacity: 4 }],
      blocks: [{ tableId: "t4", startsAt: at("18:00"), endsAt: at("20:00") }],
    });
    // The block covers 18:00-20:00, so every possible 90-minute start (18:00-19:30) collides.
    expect(generateSlots(tableBlock)).toEqual([]);
    // A narrower block only removes the starts that overlap it.
    const narrow = base({
      tables: [{ id: "t4", capacity: 4 }],
      blocks: [{ tableId: "t4", startsAt: at("18:00"), endsAt: at("19:00") }],
    });
    expect(starts(narrow)).toEqual([at("19:00").toISOString(), at("19:30").toISOString()]);
    const wholeBlock = base({ blocks: [{ tableId: null, startsAt: at("00:00"), endsAt: at("23:59") }] });
    expect(generateSlots(wholeBlock)).toEqual([]);
  });

  it("ignores the excluded reservation (used when modifying)", () => {
    const q = base({
      tables: [{ id: "t4", capacity: 4 }],
      partySize: 4,
      reservations: [{ id: "mine", tableId: "t4", startsAt: at("18:00"), endsAt: at("19:30") }],
      excludeReservationId: "mine",
    });
    expect(starts(q)).toContain(at("18:00").toISOString());
  });

  it("filters by start-time window", () => {
    const q = base({ window: { from: "19:00", to: "19:30" } });
    expect(starts(q)).toEqual(["19:00", "19:30"].map((t) => at(t).toISOString()));
  });

  it("is stable across the DST boundary (local times map to the right UTC offsets)", () => {
    const sunday = "2026-03-29";
    const q = base({
      date: sunday,
      now: zonedWallTimeToUtc("2026-03-28", "09:00", TZ),
      hours: [{ dayOfWeek: 0, opensAt: "18:00", closesAt: "19:30" }],
    });
    // 18:00 BST == 17:00Z on the spring-forward day.
    expect(starts(q)).toEqual(["2026-03-29T17:00:00.000Z"]);
  });
});

describe("findFreeTable / overlaps", () => {
  it("treats intervals as half-open", () => {
    expect(overlaps(at("18:00"), at("19:00"), at("19:00"), at("20:00"))).toBe(false);
    expect(overlaps(at("18:00"), at("19:01"), at("19:00"), at("20:00"))).toBe(true);
  });

  it("prefers the requested table when it is free and fits", () => {
    const t = findFreeTable({
      tables: [{ id: "a", capacity: 2 }, { id: "b", capacity: 4 }],
      reservations: [],
      blocks: [],
      startsAt: at("18:00"),
      endsAt: at("19:30"),
      partySize: 2,
      preferTableId: "b",
    });
    expect(t?.id).toBe("b");
  });

  it("returns null when nothing fits", () => {
    expect(
      findFreeTable({ tables: [{ id: "a", capacity: 2 }], reservations: [], blocks: [], startsAt: at("18:00"), endsAt: at("19:30"), partySize: 3 }),
    ).toBeNull();
  });
});
