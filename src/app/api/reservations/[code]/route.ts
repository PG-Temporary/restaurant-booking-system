import { z } from "zod";
import { defineRoute } from "@/lib/route";
import { confirmationCodeSchema, emailSchema, isoInstant, partySizeSchema } from "@/lib/schemas";
import { reservationDto } from "@/services/dto";
import { getReservationWithProof, modifyReservation } from "@/services/reservations";

const params = z.object({ code: confirmationCodeSchema });
const query = z.object({ email: emailSchema.optional() });
const body = z
  .object({
    email: emailSchema.optional(),
    startsAt: isoInstant.optional(),
    partySize: partySizeSchema.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.startsAt || b.partySize || b.notes !== undefined, "Nothing to change");

// Proof of ownership = the confirmation code plus the booking email, or being signed in as the booker.
export const GET = defineRoute({ auth: "public", params, query }, async ({ actor, params, query }) =>
  reservationDto(await getReservationWithProof(params.code, { email: query.email, userId: actor?.userId })),
);

export const PATCH = defineRoute({ auth: "public", params, body }, async ({ actor, params, body }) => {
  const { email, ...changes } = body;
  return reservationDto(await modifyReservation(params.code, { email, userId: actor?.userId }, changes));
});
