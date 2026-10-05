import type { ReservationView } from "./reservations";

/** Public-facing shape: no internal ids beyond what clients need. */
export function reservationDto(r: ReservationView) {
  return {
    id: r.id,
    confirmationCode: r.confirmationCode,
    status: r.status,
    source: r.source,
    partySize: r.partySize,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    guestName: r.guestName,
    guestEmail: r.guestEmail,
    guestPhone: r.guestPhone,
    notes: r.notes,
    table: { id: r.table.id, name: r.table.name, capacity: r.table.capacity },
    restaurant: { name: r.restaurant.name, slug: r.restaurant.slug, timezone: r.restaurant.timezone },
  };
}
