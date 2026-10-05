import { prisma } from "@/lib/db";
import { zonedWallTimeToUtc } from "@/lib/time";
import { hashPassword } from "@/lib/password";

/** Fixed "now" (Monday 2026-10-05 10:00 UTC, London is on BST) so tests are deterministic. */
export const NOW = new Date("2026-10-05T10:00:00Z");
/** A Friday inside the booking horizon. */
export const FRIDAY = "2026-10-09";
export const at = (hhmm: string, date = FRIDAY, tz = "Europe/London") => zonedWallTimeToUtc(date, hhmm, tz);

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "Reservation","Block","OpeningHours","restaurant_tables","Restaurant","User","GeoPlace" RESTART IDENTITY CASCADE`,
  );
}

let counter = 0;

export async function makeRestaurant(opts: {
  name?: string;
  tables: Array<[name: string, capacity: number]>;
  hours?: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>;
  slotLengthMinutes?: number;
  leadTimeMinutes?: number;
  maxPartySize?: number;
  lat?: number;
  lng?: number;
  city?: string;
}) {
  const n = ++counter;
  const owner = await prisma.user.create({
    data: { email: `owner${n}@test.dev`, name: `Owner ${n}`, passwordHash: await hashPassword("password123"), role: "OWNER" },
  });
  const restaurant = await prisma.restaurant.create({
    data: {
      ownerId: owner.id,
      name: opts.name ?? `Test Restaurant ${n}`,
      slug: `test-restaurant-${n}`,
      city: opts.city ?? "London",
      postcode: "E1 6QL",
      latitude: opts.lat ?? 51.5215,
      longitude: opts.lng ?? -0.0717,
      slotLengthMinutes: opts.slotLengthMinutes ?? 90,
      slotIntervalMinutes: 30,
      leadTimeMinutes: opts.leadTimeMinutes ?? 60,
      maxPartySize: opts.maxPartySize ?? 8,
      tables: { create: opts.tables.map(([name, capacity]) => ({ name, capacity })) },
      openingHours: {
        create: (opts.hours ?? [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: "18:00", closesAt: "22:00" }))).map((h) => h),
      },
    },
    include: { tables: true },
  });
  return { owner, restaurant };
}

export const guest = (n = 1) => ({ name: `Guest ${n}`, email: `guest${n}@test.dev`, phone: "07700900000" });
