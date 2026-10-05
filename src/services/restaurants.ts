import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { conflict, badRequest, notFound } from "@/lib/errors";
import { normalizeLocationKey } from "@/lib/geo";
import { timeToMinutes, localDayRangeUtc } from "@/lib/time";
import { ACTIVE_STATUSES } from "./availability-data";

export interface HoursInput {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}

export interface RestaurantUpdateInput {
  name: string;
  description: string;
  address: string;
  city: string;
  postcode: string;
  latitude?: number | null;
  longitude?: number | null;
  timezone: string;
  slotLengthMinutes: number;
  slotIntervalMinutes: number;
  leadTimeMinutes: number;
  maxPartySize: number;
  openingHours: HoursInput[];
}

export async function getOwnerRestaurant(restaurantId: string) {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: {
      openingHours: { orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }] },
      tables: { orderBy: [{ active: "desc" }, { capacity: "asc" }, { name: "asc" }] },
    },
  });
  if (!r) throw notFound("Restaurant");
  return r;
}

export function validateHours(hours: HoursInput[]): void {
  const byDay = new Map<number, HoursInput[]>();
  for (const h of hours) {
    if (timeToMinutes(h.closesAt) <= timeToMinutes(h.opensAt)) {
      throw badRequest(`Closing time must be after opening time (${h.opensAt}-${h.closesAt}). Overnight service is not supported in v1.`);
    }
    byDay.set(h.dayOfWeek, [...(byDay.get(h.dayOfWeek) ?? []), h]);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => timeToMinutes(a.opensAt) - timeToMinutes(b.opensAt));
    for (let i = 1; i < list.length; i++) {
      if (timeToMinutes(list[i].opensAt) < timeToMinutes(list[i - 1].closesAt)) {
        throw badRequest("Opening hours on the same day must not overlap.");
      }
    }
  }
}

/** Look up coordinates for a typed postcode / city in the local gazetteer. */
export async function resolvePlace(text: string): Promise<{ lat: number; lng: number; name: string } | null> {
  const key = normalizeLocationKey(text);
  if (!key) return null;
  const candidates = [key];
  if (key.length >= 5) candidates.push(key.slice(0, -3)); // full UK postcode -> outward code
  const places = await prisma.geoPlace.findMany({ where: { key: { in: candidates } } });
  for (const c of candidates) {
    const hit = places.find((p) => p.key === c);
    if (hit) return { lat: hit.lat, lng: hit.lng, name: hit.name };
  }
  return null;
}

export async function updateRestaurant(restaurantId: string, input: RestaurantUpdateInput) {
  validateHours(input.openingHours);

  let { latitude, longitude } = input;
  if (latitude == null || longitude == null) {
    const place = (await resolvePlace(input.postcode)) ?? (await resolvePlace(input.city));
    latitude = place?.lat ?? null;
    longitude = place?.lng ?? null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        name: input.name,
        description: input.description,
        address: input.address,
        city: input.city,
        postcode: input.postcode,
        latitude,
        longitude,
        timezone: input.timezone,
        slotLengthMinutes: input.slotLengthMinutes,
        slotIntervalMinutes: input.slotIntervalMinutes,
        leadTimeMinutes: input.leadTimeMinutes,
        maxPartySize: input.maxPartySize,
      },
    });
    await tx.openingHours.deleteMany({ where: { restaurantId } });
    if (input.openingHours.length > 0) {
      await tx.openingHours.createMany({ data: input.openingHours.map((h) => ({ ...h, restaurantId })) });
    }
  });
  return { ...(await getOwnerRestaurant(restaurantId)), locationResolved: latitude != null && longitude != null };
}

// --- tables -----------------------------------------------------------------

export async function createTable(restaurantId: string, input: { name: string; capacity: number }) {
  try {
    return await prisma.table.create({ data: { restaurantId, name: input.name, capacity: input.capacity } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw conflict("TABLE_NAME_TAKEN", "You already have a table with that name.");
    }
    throw e;
  }
}

export async function updateTable(
  restaurantId: string,
  tableId: string,
  input: { name?: string; capacity?: number; active?: boolean },
) {
  const table = await prisma.table.findFirst({ where: { id: tableId, restaurantId } });
  if (!table) throw notFound("Table");

  const shrinking = input.capacity !== undefined && input.capacity < table.capacity;
  const deactivating = input.active === false && table.active;
  if (shrinking || deactivating) {
    const upcoming = await prisma.reservation.findMany({
      where: { tableId, status: { in: [...ACTIVE_STATUSES] }, endsAt: { gt: new Date() } },
      select: { confirmationCode: true, partySize: true, startsAt: true },
    });
    const offending = deactivating ? upcoming : upcoming.filter((r) => r.partySize > input.capacity!);
    if (offending.length > 0) {
      throw conflict(
        "TABLE_HAS_RESERVATIONS",
        "Move or cancel the upcoming reservations on this table first.",
        offending.map((r) => ({ code: r.confirmationCode, startsAt: r.startsAt })),
      );
    }
  }
  try {
    return await prisma.table.update({ where: { id: tableId }, data: input });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw conflict("TABLE_NAME_TAKEN", "You already have a table with that name.");
    }
    throw e;
  }
}

// --- blocks -----------------------------------------------------------------

export interface BlockInput {
  tableId?: string | null;
  startsAt: Date;
  endsAt: Date;
  reason: string;
}

export async function createBlock(restaurantId: string, input: BlockInput) {
  if (input.endsAt <= input.startsAt) throw badRequest("Block must end after it starts.");
  return prisma.$transaction(
    async (tx) => {
      // Same per-restaurant lock as bookings so a block and a booking cannot race.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${restaurantId}))`;
      if (input.tableId) {
        const t = await tx.table.findFirst({ where: { id: input.tableId, restaurantId }, select: { id: true } });
        if (!t) throw notFound("Table");
      }
      const clashes = await tx.reservation.findMany({
        where: {
          restaurantId,
          ...(input.tableId ? { tableId: input.tableId } : {}),
          status: { in: [...ACTIVE_STATUSES] },
          startsAt: { lt: input.endsAt },
          endsAt: { gt: input.startsAt },
        },
        select: { confirmationCode: true, startsAt: true, guestName: true },
      });
      if (clashes.length > 0) {
        throw conflict(
          "BLOCK_CONFLICTS_RESERVATION",
          `${clashes.length} existing reservation(s) overlap this block. Move or cancel them first.`,
          clashes,
        );
      }
      return tx.block.create({
        data: {
          restaurantId,
          tableId: input.tableId ?? null,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          reason: input.reason,
        },
      });
    },
    { timeout: 15_000, maxWait: 15_000 },
  );
}

export async function wholeDayRange(restaurantId: string, date: string) {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } });
  if (!r) throw notFound("Restaurant");
  return localDayRangeUtc(date, r.timezone);
}

export async function listBlocks(restaurantId: string) {
  return prisma.block.findMany({
    where: { restaurantId, endsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" },
    include: { table: { select: { name: true } } },
  });
}

export async function deleteBlock(restaurantId: string, blockId: string) {
  const res = await prisma.block.deleteMany({ where: { id: blockId, restaurantId } });
  if (res.count === 0) throw notFound("Block");
}
