import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  cancelReservation,
  createOnlineReservation,
  createStaffReservation,
  getReservationWithProof,
  modifyReservation,
  setReservationStatus,
} from "@/services/reservations";
import { createBlock, createTable, updateTable } from "@/services/restaurants";
import { getRestaurantAvailability, searchAvailability } from "@/services/search";
import { registerUser, verifyCredentials } from "@/services/users";
import { FRIDAY, NOW, at, guest, makeRestaurant, resetDb } from "./helpers";
import { seedDemo } from "../prisma/seed-data.ts";

beforeEach(resetDb);

const book = (slug: string, hhmm: string, partySize = 2, email = "g@test.dev", date = FRIDAY) =>
  createOnlineReservation({ restaurantSlug: slug, startsAt: at(hhmm, date), partySize, guest: { ...guest(), email }, now: NOW });

describe("booking rules", () => {
  it("rejects closed days, off-grid times, out-of-hours times, oversize parties and lead-time violations", async () => {
    const { restaurant } = await makeRestaurant({
      tables: [["A", 12]],
      hours: [{ dayOfWeek: 5, opensAt: "18:00", closesAt: "22:00" }],
      maxPartySize: 8,
    });
    const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => e.code);
    expect(await code(book(restaurant.slug, "19:00", 2, "g@test.dev", "2026-10-10"))).toBe("SLOT_UNAVAILABLE"); // Saturday closed
    expect(await code(book(restaurant.slug, "19:15"))).toBe("SLOT_UNAVAILABLE"); // off the 30-min grid
    expect(await code(book(restaurant.slug, "17:00"))).toBe("SLOT_UNAVAILABLE"); // before opening
    expect(await code(book(restaurant.slug, "21:00"))).toBe("SLOT_UNAVAILABLE"); // would run past closing
    expect(await code(book(restaurant.slug, "19:00", 9))).toBe("SLOT_UNAVAILABLE"); // above max party (12-top exists)
    const soon = createOnlineReservation({
      restaurantSlug: restaurant.slug, startsAt: at("19:00"), partySize: 2, guest: guest(),
      now: new Date(at("19:00").getTime() - 30 * 60_000), // 30 min notice < 60 min lead time
    });
    expect(await code(soon)).toBe("SLOT_UNAVAILABLE");
    expect(await code(book(restaurant.slug, "19:00"))).toBe("ok");
  });

  it("stores UTC and honours the restaurant's timezone", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["A", 2]] });
    await prisma.restaurant.update({ where: { id: restaurant.id }, data: { timezone: "America/New_York" } });
    const r = await createOnlineReservation({
      restaurantSlug: restaurant.slug, startsAt: at("19:00", FRIDAY, "America/New_York"), partySize: 2, guest: guest(), now: NOW,
    });
    expect(r.startsAt.toISOString()).toBe("2026-10-09T23:00:00.000Z"); // 19:00 EDT
  });
});

describe("modify & cancel", () => {
  it("lets the guest move a booking, keeping the table, and frees the old slot", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["Only", 2]] });
    const r = await book(restaurant.slug, "19:00", 2, "m@test.dev");
    const moved = await modifyReservation(r.confirmationCode, { email: "m@test.dev" }, { startsAt: at("20:00"), now: NOW });
    expect(moved.startsAt.toISOString()).toBe(at("20:00").toISOString());
    expect(moved.tableId).toBe(r.tableId);
    // Old slot is bookable again.
    await expect(book(restaurant.slug, "18:00", 2, "other@test.dev")).resolves.toBeDefined();
  });

  it("allows a booking to 'move' onto time it already occupies (own slot not counted as a clash)", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["Only", 2]] });
    const r = await book(restaurant.slug, "19:00", 2, "m@test.dev");
    await expect(modifyReservation(r.confirmationCode, { email: "m@test.dev" }, { startsAt: at("19:30"), now: NOW })).resolves.toBeDefined();
  });

  it("refuses a move into a taken slot and leaves the original untouched", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["Only", 2]] });
    const mine = await book(restaurant.slug, "18:00", 2, "m@test.dev");
    await book(restaurant.slug, "20:00", 2, "x@test.dev");
    await expect(modifyReservation(mine.confirmationCode, { email: "m@test.dev" }, { startsAt: at("20:00"), now: NOW })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: mine.id } })).startsAt.toISOString()).toBe(at("18:00").toISOString());
  });

  it("reassigns tables when a party grows beyond the current table", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["Small", 2], ["Big", 6]] });
    const r = await book(restaurant.slug, "19:00", 2, "m@test.dev");
    expect(r.table.name).toBe("Small");
    const grown = await modifyReservation(r.confirmationCode, { email: "m@test.dev" }, { partySize: 5, now: NOW });
    expect(grown.table.name).toBe("Big");
  });

  it("requires proof: wrong email is refused, signed-in owner of the booking is accepted", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["A", 2]] });
    const diner = await registerUser({ role: "DINER", name: "Dee", email: "dee@test.dev", password: "password123" });
    const r = await createOnlineReservation({ restaurantSlug: restaurant.slug, startsAt: at("19:00"), partySize: 2, guest: { ...guest(), email: "other@test.dev" }, userId: diner.id, now: NOW });
    await expect(getReservationWithProof(r.confirmationCode, { email: "nope@test.dev" })).rejects.toMatchObject({ status: 404 });
    await expect(getReservationWithProof(r.confirmationCode, { userId: diner.id })).resolves.toBeDefined();
    await expect(getReservationWithProof(r.confirmationCode, { userId: "someone-else" })).rejects.toMatchObject({ status: 404 });
  });

  it("cannot cancel or modify once seated, completed, or already started", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["A", 2]] });
    const r = await book(restaurant.slug, "19:00", 2, "m@test.dev");
    await setReservationStatus(restaurant.id, r.id, "SEATED");
    await expect(cancelReservation(r.confirmationCode, { email: "m@test.dev" }, NOW)).rejects.toMatchObject({ code: "NOT_CANCELLABLE" });
    await expect(modifyReservation(r.confirmationCode, { email: "m@test.dev" }, { partySize: 1, now: NOW })).rejects.toMatchObject({ code: "NOT_MODIFIABLE" });

    const r2 = await book(restaurant.slug, "20:30", 2, "n@test.dev");
    await expect(cancelReservation(r2.confirmationCode, { email: "n@test.dev" }, at("20:35"))).rejects.toMatchObject({ code: "NOT_CANCELLABLE" });
  });
});

describe("restaurant operations", () => {
  it("enforces the status state machine", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["A", 2]] });
    const r = await book(restaurant.slug, "19:00");
    await expect(setReservationStatus(restaurant.id, r.id, "COMPLETED")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect((await setReservationStatus(restaurant.id, r.id, "SEATED")).status).toBe("SEATED");
    expect((await setReservationStatus(restaurant.id, r.id, "COMPLETED")).status).toBe("COMPLETED");
    await expect(setReservationStatus(restaurant.id, r.id, "CONFIRMED")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("no-show frees the table", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["A", 2]] });
    const r = await book(restaurant.slug, "19:00");
    await setReservationStatus(restaurant.id, r.id, "NO_SHOW");
    await expect(book(restaurant.slug, "19:00", 2, "again@test.dev")).resolves.toBeDefined();
  });

  it("walk-ins are seated immediately and may bypass lead time & online party cap, phone bookings stay confirmed", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["Big", 12]], maxPartySize: 4 });
    const walkIn = await createStaffReservation({ restaurantId: restaurant.id, startsAt: at("19:00"), partySize: 10, guest: { name: "Walk In" }, source: "WALK_IN", now: at("19:00") });
    expect(walkIn.status).toBe("SEATED");
    const phone = await createStaffReservation({ restaurantId: restaurant.id, startsAt: at("21:00"), partySize: 3, guest: { name: "Phone", phone: "123456" }, source: "PHONE", now: NOW });
    expect(phone.status).toBe("CONFIRMED");
    expect(phone.source).toBe("PHONE");
    await expect(
      createStaffReservation({ restaurantId: restaurant.id, startsAt: at("19:30"), partySize: 2, guest: { name: "Clash" }, source: "PHONE", now: NOW }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  it("blocks remove availability; whole-restaurant blocks close everything; conflicting blocks are refused", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["A", 2], ["B", 2]] });
    const [A] = restaurant.tables;
    await createBlock(restaurant.id, { tableId: A.id, startsAt: at("18:00"), endsAt: at("22:00"), reason: "broken" });
    const half = await getRestaurantAvailability({ slug: restaurant.slug, date: FRIDAY, partySize: 2, now: NOW });
    expect(half.slots.length).toBeGreaterThan(0);
    await book(restaurant.slug, "19:00"); // takes table B
    await expect(book(restaurant.slug, "19:00", 2, "late@test.dev")).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

    await expect(createBlock(restaurant.id, { startsAt: at("18:00"), endsAt: at("22:00"), reason: "private" })).rejects.toMatchObject({ code: "BLOCK_CONFLICTS_RESERVATION" });

    const { restaurant: r2 } = await makeRestaurant({ tables: [["A", 2]] });
    await createBlock(r2.id, { startsAt: at("00:00"), endsAt: at("23:59"), reason: "closed for refit" });
    expect((await getRestaurantAvailability({ slug: r2.slug, date: FRIDAY, partySize: 2, now: NOW })).slots).toEqual([]);
  });

  it("won't deactivate or shrink a table that has upcoming reservations, but allows new tables", async () => {
    const { restaurant } = await makeRestaurant({ tables: [["A", 4]] });
    await book(restaurant.slug, "19:00", 4);
    const t = restaurant.tables[0];
    await expect(updateTable(restaurant.id, t.id, { active: false })).rejects.toMatchObject({ code: "TABLE_HAS_RESERVATIONS" });
    await expect(updateTable(restaurant.id, t.id, { capacity: 2 })).rejects.toMatchObject({ code: "TABLE_HAS_RESERVATIONS" });
    await expect(updateTable(restaurant.id, t.id, { capacity: 6 })).resolves.toBeDefined();
    await expect(createTable(restaurant.id, { name: "B", capacity: 2 })).resolves.toBeDefined();
    await expect(createTable(restaurant.id, { name: "B", capacity: 2 })).rejects.toMatchObject({ code: "TABLE_NAME_TAKEN" });
  });

  it("a restaurant without tables or hours offers nothing", async () => {
    const { restaurant } = await makeRestaurant({ tables: [], hours: [] });
    expect((await getRestaurantAvailability({ slug: restaurant.slug, date: FRIDAY, partySize: 2, now: NOW })).slots).toEqual([]);
  });
});

describe("search", () => {
  it("returns only restaurants within radius that truly have capacity, nearest first", async () => {
    await seedDemo(prisma);
    const q = { location: "E1 6QL", radiusKm: 10, date: FRIDAY, partySize: 2, now: NOW };
    const { results } = await searchAvailability(q);
    const slugs = results.map((r) => r.slug);
    expect(slugs).toContain("trattoria-brick-lane");
    expect(slugs).not.toContain("northern-quarter-bistro"); // Manchester
    expect(results.map((r) => r.distanceKm)).toEqual([...results.map((r) => r.distanceKm)].sort((a, b) => a - b));

    // Party larger than any restaurant's max (8) -> nobody.
    expect((await searchAvailability({ ...q, partySize: 9 })).results).toEqual([]);
    // Radius is respected.
    const tight = await searchAvailability({ ...q, radiusKm: 0.5 });
    expect(tight.results.every((r) => r.distanceKm <= 0.5)).toBe(true);
    // Time window narrows the slots.
    const win = await searchAvailability({ ...q, from: "19:00", to: "19:30" });
    for (const r of win.results) expect(r.slots.map((s) => s.label).every((l) => l >= "19:00" && l <= "19:30")).toBe(true);
  });

  it("explains unknown locations", async () => {
    await seedDemo(prisma);
    await expect(searchAvailability({ location: "Atlantis", radiusKm: 5, date: FRIDAY, partySize: 2, now: NOW })).rejects.toMatchObject({ code: "UNKNOWN_LOCATION" });
  });

  it("never lists past slots", async () => {
    await seedDemo(prisma);
    const lateNow = at("20:00");
    const { results } = await searchAvailability({ location: "London", radiusKm: 50, date: FRIDAY, partySize: 2, now: lateNow });
    for (const r of results) for (const s of r.slots) expect(new Date(s.startsAt).getTime()).toBeGreaterThanOrEqual(lateNow.getTime() + 60 * 60_000);
  });
});

describe("accounts", () => {
  it("registers owners with a restaurant, hashes passwords, rejects duplicates, verifies logins", async () => {
    const owner = await registerUser({ role: "OWNER", name: "Olly", email: "Olly@Test.dev", password: "supersecret1", restaurantName: "Olly's Place" });
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: owner.id }, include: { restaurant: true } });
    expect(stored.email).toBe("olly@test.dev");
    expect(stored.passwordHash).not.toContain("supersecret1");
    expect(stored.restaurant?.slug).toBe("ollys-place");
    await expect(registerUser({ role: "DINER", name: "Dup", email: "olly@test.dev", password: "supersecret1" })).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    expect(await verifyCredentials("olly@test.dev", "supersecret1")).toMatchObject({ role: "OWNER" });
    expect(await verifyCredentials("olly@test.dev", "wrong")).toBeNull();
    expect(await verifyCredentials("nobody@test.dev", "supersecret1")).toBeNull();
    // Same-named restaurant gets a distinct slug.
    const second = await registerUser({ role: "OWNER", name: "Ollie", email: "ollie@test.dev", password: "supersecret1", restaurantName: "Olly's Place" });
    expect((await prisma.restaurant.findUniqueOrThrow({ where: { ownerId: second.id } })).slug).toBe("ollys-place-2");
  });
});
