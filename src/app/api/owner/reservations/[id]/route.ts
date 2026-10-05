import { z } from "zod";
import { defineRoute, requireOwner } from "@/lib/route";
import { reservationStatusSchema } from "@/lib/schemas";
import { reservationDto } from "@/services/dto";
import { setReservationStatus } from "@/services/reservations";

const params = z.object({ id: z.string().min(1).max(40) });
const body = z.object({ status: reservationStatusSchema });

export const PATCH = defineRoute({ auth: "owner", params, body }, async ({ actor, params, body }) =>
  reservationDto(await setReservationStatus(requireOwner(actor).restaurantId, params.id, body.status)),
);
