import { prisma } from "@/lib/db";
import { boundingBox, haversineKm } from "@/lib/geo";
import { AppError, notFound } from "@/lib/errors";
import { formatTime } from "@/lib/format";
import { loadAvailabilityBatch, loadAvailabilityData, slotsFor } from "./availability-data";
import { resolvePlace } from "./restaurants";

export interface SearchInput {
  location: string;
  radiusKm: number;
  date: string;
  partySize: number;
  from?: string;
  to?: string;
  now?: Date;
}

export interface SearchResultSlot {
  startsAt: string; // ISO UTC
  /** Local wall-clock label in the restaurant's timezone. */
  label: string;
}

export interface SearchResult {
  id: string;
  slug: string;
  name: string;
  city: string;
  address: string;
  description: string;
  distanceKm: number;
  slots: SearchResultSlot[];
}

/** Restaurants near `location` that have at least one bookable slot for the party on `date`. */
export async function searchAvailability(input: SearchInput): Promise<{ centre: { name: string; lat: number; lng: number }; results: SearchResult[] }> {
  const place = await resolvePlace(input.location);
  if (!place) {
    throw new AppError(422, "UNKNOWN_LOCATION", "We don't recognise that location. Try a city or the start of a postcode (e.g. London, E1).");
  }
  const box = boundingBox(place.lat, place.lng, input.radiusKm);
  const candidates = await prisma.restaurant.findMany({
    where: {
      latitude: { gte: box.minLat, lte: box.maxLat },
      longitude: { gte: box.minLng, lte: box.maxLng },
    },
    select: { id: true, slug: true, name: true, city: true, address: true, description: true, latitude: true, longitude: true },
  });
  const near = candidates
    .map((r) => ({ r, distanceKm: haversineKm(place.lat, place.lng, r.latitude!, r.longitude!) }))
    .filter((x) => x.distanceKm <= input.radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 50);

  const data = await loadAvailabilityBatch(
    prisma,
    near.map((x) => x.r.id),
    input.date,
  );
  const now = input.now ?? new Date();
  const results: SearchResult[] = [];
  for (const { r, distanceKm } of near) {
    const d = data.get(r.id);
    if (!d) continue;
    const slots = slotsFor(d, { date: input.date, partySize: input.partySize, now, window: { from: input.from, to: input.to } });
    if (slots.length === 0) continue; // only restaurants with REAL availability
    results.push({
      id: r.id,
      slug: r.slug,
      name: r.name,
      city: r.city,
      address: r.address,
      description: r.description,
      distanceKm: Math.round(distanceKm * 10) / 10,
      slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), label: formatTime(s.startsAt, d.restaurant.timezone) })),
    });
  }
  return { centre: { name: place.name, lat: place.lat, lng: place.lng }, results };
}

/** Slots for a single restaurant (used by the restaurant page and the modify flow). */
export async function getRestaurantAvailability(input: {
  slug: string;
  date: string;
  partySize: number;
  excludeCode?: string;
  now?: Date;
}) {
  const r = await prisma.restaurant.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (!r) throw notFound("Restaurant");
  const d = await loadAvailabilityData(prisma, r.id, input.date);
  if (!d) throw notFound("Restaurant");

  let excludeReservationId: string | undefined;
  if (input.excludeCode) {
    const own = await prisma.reservation.findUnique({
      where: { confirmationCode: input.excludeCode },
      select: { id: true, restaurantId: true },
    });
    if (own && own.restaurantId === r.id) excludeReservationId = own.id;
  }

  const slots = slotsFor(d, { date: input.date, partySize: input.partySize, now: input.now ?? new Date(), excludeReservationId });
  return {
    restaurant: { name: d.restaurant.name, slug: d.restaurant.slug, timezone: d.restaurant.timezone, maxPartySize: d.restaurant.maxPartySize },
    slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), label: formatTime(s.startsAt, d.restaurant.timezone) })),
  };
}

export async function getPublicRestaurant(slug: string) {
  const r = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, description: true, address: true, city: true, postcode: true, timezone: true, maxPartySize: true, slotLengthMinutes: true },
  });
  if (!r) throw notFound("Restaurant");
  return r;
}
