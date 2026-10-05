import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(), handlers: { GET: vi.fn(), POST: vi.fn() } }));

import { prisma } from "@/lib/db";
import { definedRoutes } from "@/lib/route";
import { createOnlineReservation } from "@/services/reservations";
import { createBlock } from "@/services/restaurants";
import { FRIDAY, NOW, at, guest, makeRestaurant, resetDb } from "./helpers";
import { ctx, jsonReq, signInAs, signOut } from "./route-helpers";

import { GET as ownerDayGET, POST as ownerBookingPOST } from "@/app/api/owner/reservations/route";
import { PATCH as ownerStatusPATCH } from "@/app/api/owner/reservations/[id]/route";
import { GET as blocksGET, POST as blocksPOST } from "@/app/api/owner/blocks/route";
import { DELETE as blockDELETE } from "@/app/api/owner/blocks/[id]/route";
import { PATCH as tablePATCH } from "@/app/api/owner/tables/[id]/route";
import { PUT as restaurantPUT, GET as restaurantGET } from "@/app/api/owner/restaurant/route";
import { GET as searchGET } from "@/app/api/search/route";
import { POST as reservationPOST } from "@/app/api/reservations/route";
import { GET as meGET } from "@/app/api/me/reservations/route";

beforeEach(async () => {
  await resetDb();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  signOut();
});

describe("every API route validates input with Zod and checks authorisation", () => {
  const apiRoot = join(process.cwd(), "src/app/api");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === "route.ts") files.push(p);
    }
  };
  walk(apiRoot);

  // Auth.js owns its own endpoint; its credentials are validated by loginSchema in src/auth.ts.
  const EXEMPT = new Set(["auth/[...nextauth]/route.ts"]);

  it("finds the routes", () => {
    expect(files.length).toBeGreaterThanOrEqual(13);
  });

  for (const file of files) {
    const rel = relative(apiRoot, file);
    if (EXEMPT.has(rel)) continue;
    it(`${rel} exports only defineRoute() handlers`, async () => {
      const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
      const verbs = Object.keys(mod).filter((k) => ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(k));
      expect(verbs.length).toBeGreaterThan(0);
      for (const v of verbs) expect(definedRoutes.has(mod[v] as object), `${rel} ${v}`).toBe(true);
      // Every route must declare its auth mode explicitly.
      expect(readFileSync(file, "utf8")).toMatch(/auth:\s*"(public|user|owner)"/);
    });
  }
});

describe("authentication & authorisation", () => {
  it("rejects anonymous callers on owner and account routes (401)", async () => {
    expect((await ownerDayGET(jsonReq("GET", "/api/owner/reservations", undefined, { date: FRIDAY }))).status).toBe(401);
    expect((await restaurantGET(jsonReq("GET", "/api/owner/restaurant"))).status).toBe(401);
    expect((await meGET(jsonReq("GET", "/api/me/reservations"))).status).toBe(401);
  });

  it("rejects a signed-in diner on owner routes (403)", async () => {
    const diner = await prisma.user.create({ data: { email: "d@test.dev", name: "D", passwordHash: "x", role: "DINER" } });
    signInAs(diner.id, "DINER");
    expect((await ownerDayGET(jsonReq("GET", "/api/owner/reservations", undefined, { date: FRIDAY }))).status).toBe(403);
    expect((await restaurantGET(jsonReq("GET", "/api/owner/restaurant"))).status).toBe(403);
  });

  it("checks authorisation BEFORE validating input (no schema leakage to anonymous callers)", async () => {
    const res = await blocksPOST(jsonReq("POST", "/api/owner/blocks", { nonsense: true }));
    expect(res.status).toBe(401);
  });
});

describe("input validation", () => {
  it("returns 400 with field details for bad query params", async () => {
    const res = await searchGET(jsonReq("GET", "/api/search", undefined, { location: "E1", date: "2026-13-45", partySize: 2 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.fieldErrors.date).toBeDefined();
  });

  it("returns 400 for malformed JSON and for missing/invalid body fields", async () => {
    const bad = new Request("http://localhost/api/reservations", { method: "POST", body: "{not json", headers: { "content-type": "application/json" } });
    expect((await reservationPOST(bad)).status).toBe(400);
    const res = await reservationPOST(jsonReq("POST", "/api/reservations", { restaurantSlug: "x", startsAt: "tomorrow", partySize: 0, guest: {} }));
    expect(res.status).toBe(400);
  });

  it("validates owner bodies too (bad hours, bad timezone)", async () => {
    const { owner } = await makeRestaurant({ tables: [["A", 2]] });
    signInAs(owner.id, "OWNER");
    const res = await restaurantPUT(
      jsonReq("PUT", "/api/owner/restaurant", {
        name: "X", city: "London", postcode: "E1", timezone: "Mars/Olympus", slotLengthMinutes: 90, slotIntervalMinutes: 30,
        leadTimeMinutes: 60, maxPartySize: 8, openingHours: [{ dayOfWeek: 9, opensAt: "25:00", closesAt: "10:00" }],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects overlapping or inverted opening hours with a 400", async () => {
    const { owner } = await makeRestaurant({ tables: [["A", 2]] });
    signInAs(owner.id, "OWNER");
    const put = (openingHours: unknown) =>
      restaurantPUT(
        jsonReq("PUT", "/api/owner/restaurant", {
          name: "X", city: "London", postcode: "E1", timezone: "Europe/London", slotLengthMinutes: 90, slotIntervalMinutes: 30,
          leadTimeMinutes: 60, maxPartySize: 8, openingHours,
        }),
      );
    expect((await put([{ dayOfWeek: 1, opensAt: "22:00", closesAt: "02:00" }])).status).toBe(400);
    expect((await put([{ dayOfWeek: 1, opensAt: "12:00", closesAt: "15:00" }, { dayOfWeek: 1, opensAt: "14:00", closesAt: "18:00" }])).status).toBe(400);
    expect((await put([{ dayOfWeek: 1, opensAt: "12:00", closesAt: "15:00" }, { dayOfWeek: 1, opensAt: "18:00", closesAt: "22:00" }])).status).toBe(200);
  });
});

describe("multi-tenancy: restaurant A cannot read or modify restaurant B's data", () => {
  async function twoRestaurants() {
    const A = await makeRestaurant({ name: "Alpha", tables: [["A1", 2], ["A2", 4]] });
    const B = await makeRestaurant({ name: "Bravo", tables: [["B1", 2], ["B2", 4]] });
    const resA = await createOnlineReservation({ restaurantSlug: A.restaurant.slug, startsAt: at("19:00"), partySize: 2, guest: guest(1), now: NOW });
    const resB = await createOnlineReservation({ restaurantSlug: B.restaurant.slug, startsAt: at("19:00"), partySize: 2, guest: guest(2), now: NOW });
    const blockA = await createBlock(A.restaurant.id, { startsAt: at("12:00"), endsAt: at("13:00"), reason: "A private" });
    return { A, B, resA, resB, blockA };
  }

  it("B's day view only contains B's reservations", async () => {
    const { B, resA, resB } = await twoRestaurants();
    signInAs(B.owner.id, "OWNER");
    const res = await ownerDayGET(jsonReq("GET", "/api/owner/reservations", undefined, { date: FRIDAY }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const codes = body.reservations.map((r: { confirmationCode: string }) => r.confirmationCode);
    expect(codes).toEqual([resB.confirmationCode]);
    expect(codes).not.toContain(resA.confirmationCode);
    expect(body.tables.map((t: { name: string }) => t.name).sort()).toEqual(["B1", "B2"]);
  });

  it("B cannot change the status of A's reservation (404, and nothing changes)", async () => {
    const { B, resA } = await twoRestaurants();
    signInAs(B.owner.id, "OWNER");
    for (const status of ["SEATED", "CANCELLED", "NO_SHOW"]) {
      const res = await ownerStatusPATCH(jsonReq("PATCH", `/api/owner/reservations/${resA.id}`, { status }), ctx({ id: resA.id }));
      expect(res.status).toBe(404);
    }
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: resA.id } })).status).toBe("CONFIRMED");
  });

  it("B cannot delete A's block, edit A's table, or book/block on A's tables", async () => {
    const { A, B, blockA } = await twoRestaurants();
    signInAs(B.owner.id, "OWNER");

    expect((await blockDELETE(jsonReq("DELETE", `/api/owner/blocks/${blockA.id}`), ctx({ id: blockA.id }))).status).toBe(404);
    expect(await prisma.block.count({ where: { id: blockA.id } })).toBe(1);

    const aTable = A.restaurant.tables[0];
    expect((await tablePATCH(jsonReq("PATCH", `/api/owner/tables/${aTable.id}`, { active: false }), ctx({ id: aTable.id }))).status).toBe(404);
    expect((await prisma.table.findUniqueOrThrow({ where: { id: aTable.id } })).active).toBe(true);

    const blockOnA = await blocksPOST(jsonReq("POST", "/api/owner/blocks", { tableId: aTable.id, date: FRIDAY }));
    expect(blockOnA.status).toBe(404);

    const walkIn = await ownerBookingPOST(
      jsonReq("POST", "/api/owner/reservations", {
        startsAt: at("20:00").toISOString(), partySize: 2, guest: { name: "Sneaky" }, source: "PHONE", tableId: aTable.id,
      }),
    );
    expect(walkIn.status).toBe(404);
    expect(await prisma.reservation.count({ where: { restaurantId: A.restaurant.id } })).toBe(1);
  });

  it("B's block list does not include A's blocks", async () => {
    const { B } = await twoRestaurants();
    signInAs(B.owner.id, "OWNER");
    const body = await (await blocksGET(jsonReq("GET", "/api/owner/blocks"))).json();
    expect(body.blocks).toEqual([]);
  });

  it("an owner's settings update only touches their own restaurant", async () => {
    const { A, B } = await twoRestaurants();
    signInAs(B.owner.id, "OWNER");
    const res = await restaurantPUT(
      jsonReq("PUT", "/api/owner/restaurant", {
        name: "Bravo Renamed", city: "London", postcode: "E1 6QL", timezone: "Europe/London", slotLengthMinutes: 60,
        slotIntervalMinutes: 30, leadTimeMinutes: 30, maxPartySize: 6, openingHours: [{ dayOfWeek: 5, opensAt: "17:00", closesAt: "21:00" }],
      }),
    );
    expect(res.status).toBe(200);
    expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: A.restaurant.id } })).name).toBe("Alpha");
    expect(await prisma.openingHours.count({ where: { restaurantId: A.restaurant.id } })).toBe(7);
  });
});
