import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createOnlineReservation, createStaffReservation, testHooks } from "@/services/reservations";
import { createBlock } from "@/services/restaurants";
import { FRIDAY, NOW, at, guest, makeRestaurant, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  // Hold every transaction open between "is it free?" and "insert" so that, WITHOUT
  // the lock/constraint, all racers would see the table as free and all would win.
  testHooks.afterAvailabilityCheck = () => new Promise((r) => setTimeout(r, 60));
});
afterEach(() => {
  testHooks.afterAvailabilityCheck = undefined;
});

const isSlotUnavailable = (r: PromiseSettledResult<unknown>) =>
  r.status === "rejected" && r.reason instanceof AppError && r.reason.code === "SLOT_UNAVAILABLE";

describe("double-booking is impossible", () => {
  it("12 concurrent requests for the LAST remaining table -> exactly one wins", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["Only table", 2]] });
    const startsAt = at("19:00");

    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        createOnlineReservation({
          restaurantSlug: restaurant.slug,
          startsAt,
          partySize: 2,
          guest: guest(i),
          now: NOW,
        }),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(isSlotUnavailable)).toHaveLength(11);
    const active = await prisma.reservation.count({ where: { restaurantId: restaurant.id, status: "CONFIRMED" } });
    expect(active).toBe(1);
  });

  it("with two tables, concurrent requests fill exactly two and land on different tables", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["A", 2], ["B", 2]] });
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        createOnlineReservation({ restaurantSlug: restaurant.slug, startsAt: at("19:00"), partySize: 2, guest: guest(i), now: NOW }),
      ),
    );
    const won = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof createOnlineReservation>>> => r.status === "fulfilled");
    expect(won).toHaveLength(2);
    expect(new Set(won.map((w) => w.value.tableId)).size).toBe(2);
    expect(results.filter(isSlotUnavailable)).toHaveLength(6);
  });

  it("overlapping (not identical) start times also conflict; adjacent ones do not", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["Only", 2]] });
    const book = (hhmm: string) =>
      createOnlineReservation({ restaurantSlug: restaurant.slug, startsAt: at(hhmm), partySize: 2, guest: guest(), now: NOW });

    await book("19:00"); // holds 19:00-20:30
    await expect(book("19:30")).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" }); // overlaps
    await expect(book("20:30")).resolves.toBeDefined(); // starts exactly when the first ends
  });

  it("online bookings and staff walk-ins racing for one table cannot both succeed", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["Only", 2]] });
    const results = await Promise.allSettled([
      createOnlineReservation({ restaurantSlug: restaurant.slug, startsAt: at("19:00"), partySize: 2, guest: guest(1), now: NOW }),
      createStaffReservation({ restaurantId: restaurant.id, startsAt: at("19:00"), partySize: 2, guest: { name: "Walk-in" }, source: "PHONE", now: NOW }),
      createOnlineReservation({ restaurantSlug: restaurant.slug, startsAt: at("19:00"), partySize: 2, guest: guest(2), now: NOW }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("a block and a booking racing for the same table never both succeed", async () => {
    const { restaurant, } = await makeRestaurant({ tables: [["Only", 2]] });
    const results = await Promise.allSettled([
      createOnlineReservation({ restaurantSlug: restaurant.slug, startsAt: at("19:00"), partySize: 2, guest: guest(), now: NOW }),
      createBlock(restaurant.id, { startsAt: at("18:00"), endsAt: at("21:00"), reason: "private event" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const reservations = await prisma.reservation.count({ where: { restaurantId: restaurant.id } });
    const blocks = await prisma.block.count({ where: { restaurantId: restaurant.id } });
    expect(reservations + blocks).toBe(1);
  });

  it("a cancelled reservation frees the table for the next booker", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["Only", 2]] });
    const first = await createOnlineReservation({ restaurantSlug: restaurant.slug, startsAt: at("19:00"), partySize: 2, guest: guest(1), now: NOW });
    await prisma.reservation.update({ where: { id: first.id }, data: { status: "CANCELLED" } });
    await expect(
      createOnlineReservation({ restaurantSlug: restaurant.slug, startsAt: at("19:00"), partySize: 2, guest: guest(2), now: NOW }),
    ).resolves.toBeDefined();
  });
});

describe("database constraint is the backstop (application lock bypassed)", () => {
  it("rejects concurrent overlapping inserts straight into the table", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["Only", 2]] });
    const table = restaurant.tables[0];
    const row = (code: string) => ({
      confirmationCode: code,
      restaurantId: restaurant.id,
      tableId: table.id,
      guestName: "x",
      guestEmail: "x@test.dev",
      guestPhone: "123456",
      partySize: 2,
      startsAt: at("19:00"),
      endsAt: at("20:30"),
    });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => prisma.reservation.create({ data: row(`RAW0000${i}`) })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(failure.reason)).toMatch(/Reservation_no_overlap|23P01|exclusion/i);
  });

  it("allows adjacent intervals and ignores non-active statuses", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["Only", 2]] });
    const t = restaurant.tables[0];
    const mk = (code: string, s: string, e: string, status: "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW" | "SEATED" = "CONFIRMED") =>
      prisma.reservation.create({
        data: { confirmationCode: code, restaurantId: restaurant.id, tableId: t.id, guestName: "x", guestEmail: "", guestPhone: "", partySize: 2, startsAt: at(s), endsAt: at(e), status },
      });
    await mk("ADJ00001", "18:00", "19:00");
    await mk("ADJ00002", "19:00", "20:00"); // adjacent: ok
    await mk("ADJ00003", "18:00", "19:00", "CANCELLED"); // overlaps #1 but cancelled: ok
    await mk("ADJ00004", "18:00", "19:00", "NO_SHOW"); // ok
    await expect(mk("ADJ00005", "18:30", "19:30", "SEATED")).rejects.toThrow(); // overlaps active
  });

  it("rejects nonsense rows (end before start, party of zero)", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["Only", 2]] });
    const base = { restaurantId: restaurant.id, tableId: restaurant.tables[0].id, guestName: "x", guestEmail: "", guestPhone: "" };
    await expect(
      prisma.reservation.create({ data: { ...base, confirmationCode: "BAD00001", partySize: 2, startsAt: at("20:00"), endsAt: at("19:00") } }),
    ).rejects.toThrow();
    await expect(
      prisma.reservation.create({ data: { ...base, confirmationCode: "BAD00002", partySize: 0, startsAt: at("19:00"), endsAt: at("20:00") } }),
    ).rejects.toThrow();
  });
});

describe("sanity", () => {
  it("fixture date is a Friday", () => {
    expect(new Date(`${FRIDAY}T12:00:00Z`).getUTCDay()).toBe(5);
  });
});
