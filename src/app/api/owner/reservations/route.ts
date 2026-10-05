import { z } from "zod";
import { defineRoute, requireOwner } from "@/lib/route";
import { dateStr, isoInstant, partySizeSchema } from "@/lib/schemas";
import { reservationDto } from "@/services/dto";
import { createStaffReservation, listDayForRestaurant } from "@/services/reservations";

const query = z.object({ date: dateStr });
const body = z.object({
  startsAt: isoInstant,
  partySize: partySizeSchema,
  guest: z.object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal("")),
    phone: z.string().trim().max(30).optional(),
  }),
  source: z.enum(["WALK_IN", "PHONE"]),
  tableId: z.string().min(1).max(40).optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const GET = defineRoute({ auth: "owner", query }, async ({ actor, query }) => {
  const day = await listDayForRestaurant(requireOwner(actor).restaurantId, query.date);
  return {
    timezone: day.restaurant.timezone,
    tables: day.tables.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity })),
    blocks: day.blocks.map((b) => ({ id: b.id, tableId: b.tableId, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), reason: b.reason })),
    reservations: day.reservations.map(reservationDto),
  };
});

export const POST = defineRoute({ auth: "owner", body }, async ({ actor, body }) => {
  const r = await createStaffReservation({ restaurantId: requireOwner(actor).restaurantId, ...body });
  return Response.json(reservationDto(r), { status: 201 });
});
