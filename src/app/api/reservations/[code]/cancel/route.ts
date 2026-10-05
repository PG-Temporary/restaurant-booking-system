import { z } from "zod";
import { defineRoute } from "@/lib/route";
import { confirmationCodeSchema, emailSchema } from "@/lib/schemas";
import { reservationDto } from "@/services/dto";
import { cancelReservation } from "@/services/reservations";

const params = z.object({ code: confirmationCodeSchema });
const body = z.object({ email: emailSchema.optional() });

export const POST = defineRoute({ auth: "public", params, body }, async ({ actor, params, body }) =>
  reservationDto(await cancelReservation(params.code, { email: body.email, userId: actor?.userId })),
);
