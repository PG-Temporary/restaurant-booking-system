import { defineRoute } from "@/lib/route";
import { reservationDto } from "@/services/dto";
import { listReservationsForUser } from "@/services/reservations";

export const GET = defineRoute({ auth: "user" }, async ({ actor }) => ({
  reservations: (await listReservationsForUser(actor!.userId)).map(reservationDto),
}));
