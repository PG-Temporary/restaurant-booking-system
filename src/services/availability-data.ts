import type { Prisma, PrismaClient } from "@prisma/client";
import { generateSlots, type BlockInfo, type BusyReservation, type HoursInfo, type SlotQuery, type TableInfo } from "@/lib/availability";
import { localDayRangeUtc } from "@/lib/time";

export type Db = PrismaClient | Prisma.TransactionClient;

export const ACTIVE_STATUSES = ["CONFIRMED", "SEATED"] as const;

export interface RestaurantRules {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  slotLengthMinutes: number;
  slotIntervalMinutes: number;
  leadTimeMinutes: number;
  maxPartySize: number;
}

export interface AvailabilityData {
  restaurant: RestaurantRules;
  tables: TableInfo[];
  hours: HoursInfo[];
  reservations: BusyReservation[];
  blocks: BlockInfo[];
}

/** Load everything the availability engine needs for several restaurants on one local date. */
export async function loadAvailabilityBatch(
  db: Db,
  restaurantIds: string[],
  date: string,
): Promise<Map<string, AvailabilityData>> {
  const out = new Map<string, AvailabilityData>();
  if (restaurantIds.length === 0) return out;

  const restaurants = await db.restaurant.findMany({
    where: { id: { in: restaurantIds } },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      slotLengthMinutes: true,
      slotIntervalMinutes: true,
      leadTimeMinutes: true,
      maxPartySize: true,
      tables: { where: { active: true }, select: { id: true, capacity: true } },
      openingHours: { select: { dayOfWeek: true, opensAt: true, closesAt: true } },
    },
  });
  if (restaurants.length === 0) return out;

  const ranges = new Map(restaurants.map((r) => [r.id, localDayRangeUtc(date, r.timezone)]));
  const minStart = new Date(Math.min(...[...ranges.values()].map((r) => r.start.getTime())));
  const maxEnd = new Date(Math.max(...[...ranges.values()].map((r) => r.end.getTime())));

  const [reservations, blocks] = await Promise.all([
    db.reservation.findMany({
      where: {
        restaurantId: { in: restaurants.map((r) => r.id) },
        status: { in: [...ACTIVE_STATUSES] },
        startsAt: { lt: maxEnd },
        endsAt: { gt: minStart },
      },
      select: { id: true, restaurantId: true, tableId: true, startsAt: true, endsAt: true },
    }),
    db.block.findMany({
      where: { restaurantId: { in: restaurants.map((r) => r.id) }, startsAt: { lt: maxEnd }, endsAt: { gt: minStart } },
      select: { restaurantId: true, tableId: true, startsAt: true, endsAt: true },
    }),
  ]);

  for (const r of restaurants) {
    const { tables, openingHours, ...rules } = r;
    out.set(r.id, {
      restaurant: rules,
      tables,
      hours: openingHours,
      reservations: reservations.filter((x) => x.restaurantId === r.id),
      blocks: blocks.filter((x) => x.restaurantId === r.id),
    });
  }
  return out;
}

export async function loadAvailabilityData(db: Db, restaurantId: string, date: string): Promise<AvailabilityData | null> {
  return (await loadAvailabilityBatch(db, [restaurantId], date)).get(restaurantId) ?? null;
}

/** Bookable slots for loaded data: fills the restaurant rules into the engine query. */
export function slotsFor(
  d: AvailabilityData,
  q: Pick<SlotQuery, "date" | "partySize" | "now" | "excludeReservationId" | "window">,
) {
  const r = d.restaurant;
  return generateSlots({
    ...q,
    timezone: r.timezone,
    hours: d.hours,
    tables: d.tables,
    reservations: d.reservations,
    blocks: d.blocks,
    slotLengthMinutes: r.slotLengthMinutes,
    slotIntervalMinutes: r.slotIntervalMinutes,
    leadTimeMinutes: r.leadTimeMinutes,
    maxPartySize: r.maxPartySize,
  });
}
