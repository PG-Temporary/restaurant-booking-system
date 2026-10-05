import { z } from "zod";
import { defineRoute } from "@/lib/route";
import { guestSchema, isoInstant, partySizeSchema } from "@/lib/schemas";
import { reservationDto } from "@/services/dto";
import { createOnlineReservation } from "@/services/reservations";

const body = z.object({
  restaurantSlug: z.string().min(1).max(80),
  startsAt: isoInstant,
  partySize: partySizeSchema,
  guest: guestSchema,
  notes: z.string().trim().max(500).optional(),
});

// Guest checkout: no account needed. A signed-in diner's bookings are linked to them.
export const POST = defineRoute({ auth: "public", body }, async ({ actor, body }) => {
  const r = await createOnlineReservation({
    ...body,
    userId: actor?.role === "DINER" ? actor.userId : null,
  });
  return Response.json(reservationDto(r), { status: 201 });
});
