// The "seeded demo" acceptance scenario, driven through the real route handlers.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(), handlers: { GET: vi.fn(), POST: vi.fn() } }));

import { prisma } from "@/lib/db";
import { seedDemo } from "../prisma/seed-data.ts";
import { FRIDAY, NOW, resetDb } from "./helpers";
import { ctx, jsonReq, signInAs, signOut } from "./route-helpers";

import { GET as searchGET } from "@/app/api/search/route";
import { POST as reservationPOST } from "@/app/api/reservations/route";
import { GET as reservationGET } from "@/app/api/reservations/[code]/route";
import { POST as cancelPOST } from "@/app/api/reservations/[code]/cancel/route";
import { GET as ownerDayGET } from "@/app/api/owner/reservations/route";
import { PATCH as statusPATCH } from "@/app/api/owner/reservations/[id]/route";

describe("seeded demo, end to end", () => {
  let ownerId: string;

  beforeAll(async () => {
    await resetDb();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const seeded = await seedDemo(prisma);
    expect(Object.keys(seeded.restaurantIds)).toHaveLength(5);
    ownerId = (await prisma.user.findUniqueOrThrow({ where: { email: "owner.trattoria@example.com" } })).id;
    signOut();
  });

  const search = async (q: Record<string, string | number>) => {
    const res = await searchGET(jsonReq("GET", "/api/search", undefined, q));
    return { status: res.status, body: await res.json() };
  };
  const book = (email: string, startsAt: string, partySize: number) =>
    reservationPOST(
      jsonReq("POST", "/api/reservations", {
        restaurantSlug: "trattoria-brick-lane",
        startsAt,
        partySize,
        guest: { name: email.split("@")[0], email, phone: "07700900123" },
      }),
    );

  it("diner finds a slot, books it, restaurant sees it and seats it, second diner can no longer book that table", async () => {
    // 1. Diner A searches near E1 for a party of 6 at 19:00 -> Trattoria (one 6-top) is available.
    const first = await search({ location: "E1", radiusKm: 5, date: FRIDAY, partySize: 6, from: "19:00", to: "19:00" });
    expect(first.status).toBe(200);
    const hit = first.body.results.find((r: { slug: string }) => r.slug === "trattoria-brick-lane");
    expect(hit).toBeDefined();
    expect(hit.slots.map((s: { label: string }) => s.label)).toEqual(["19:00"]);
    // Manchester is outside the radius and must not appear.
    expect(first.body.results.map((r: { slug: string }) => r.slug)).not.toContain("northern-quarter-bistro");

    // 2. Diner A books it as a guest.
    const startsAt = hit.slots[0].startsAt as string;
    const created = await book("anna@example.com", startsAt, 6);
    expect(created.status).toBe(201);
    const reservation = await created.json();
    expect(reservation.confirmationCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(reservation.table.name).toBe("T5");

    // 3. The restaurant sees it on its day view...
    signInAs(ownerId, "OWNER");
    const day = await (await ownerDayGET(jsonReq("GET", "/api/owner/reservations", undefined, { date: FRIDAY }))).json();
    expect(day.reservations.map((r: { confirmationCode: string }) => r.confirmationCode)).toContain(reservation.confirmationCode);

    //    ...and marks the party as seated.
    const seated = await statusPATCH(jsonReq("PATCH", `/api/owner/reservations/${reservation.id}`, { status: "SEATED" }), ctx({ id: reservation.id }));
    expect(seated.status).toBe(200);
    expect((await seated.json()).status).toBe("SEATED");
    signOut();

    // 4. Diner B searches the same thing: the slot is gone, and booking it directly is refused.
    const second = await search({ location: "E1", radiusKm: 5, date: FRIDAY, partySize: 6, from: "19:00", to: "19:00" });
    expect(second.body.results.map((r: { slug: string }) => r.slug)).not.toContain("trattoria-brick-lane");

    const refused = await book("ben@example.com", startsAt, 6);
    expect(refused.status).toBe(409);
    expect((await refused.json()).error.code).toBe("SLOT_UNAVAILABLE");

    // 5. Smaller parties are unaffected - other tables are still free at 19:00.
    const small = await search({ location: "E1", radiusKm: 5, date: FRIDAY, partySize: 2, from: "19:00", to: "19:00" });
    expect(small.body.results.map((r: { slug: string }) => r.slug)).toContain("trattoria-brick-lane");

    // 6. A seated party can no longer be cancelled online.
    const cancel = await cancelPOST(
      jsonReq("POST", `/api/reservations/${reservation.confirmationCode}/cancel`, { email: "anna@example.com" }),
      ctx({ code: reservation.confirmationCode }),
    );
    expect(cancel.status).toBe(409);
  });

  it("guests manage a booking with code + email; wrong email is indistinguishable from unknown code", async () => {
    const startsAt = new Date("2026-10-09T17:30:00Z").toISOString(); // 18:30 BST
    const created = await (await book("carla@example.com", startsAt, 2)).json();

    const ok = await reservationGET(
      jsonReq("GET", `/api/reservations/${created.confirmationCode}`, undefined, { email: "carla@example.com" }),
      ctx({ code: created.confirmationCode }),
    );
    expect(ok.status).toBe(200);

    const wrong = await reservationGET(
      jsonReq("GET", `/api/reservations/${created.confirmationCode}`, undefined, { email: "mallory@example.com" }),
      ctx({ code: created.confirmationCode }),
    );
    const unknown = await reservationGET(
      jsonReq("GET", "/api/reservations/ZZZZZZZZ", undefined, { email: "carla@example.com" }),
      ctx({ code: "ZZZZZZZZ" }),
    );
    expect(wrong.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await wrong.json()).toEqual(await unknown.json());

    // Cancelling frees the table again.
    const cancelled = await cancelPOST(
      jsonReq("POST", `/api/reservations/${created.confirmationCode}/cancel`, { email: "carla@example.com" }),
      ctx({ code: created.confirmationCode }),
    );
    expect(cancelled.status).toBe(200);
    expect((await cancelled.json()).status).toBe("CANCELLED");
  });
});
