import { Prisma, type Reservation, type ReservationSource, type ReservationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { findFreeTable, generateSlots } from "@/lib/availability";
import { generateConfirmationCode } from "@/lib/codes";
import { badRequest, conflict, notFound, slotUnavailable } from "@/lib/errors";
import { getNotifier, type ReservationNotice } from "@/lib/notify";
import { localDayRangeUtc, utcToLocalParts } from "@/lib/time";
import { ACTIVE_STATUSES, loadAvailabilityData, type Db } from "./availability-data";

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Concurrency control
//
// Two layers stop double-booking:
//  1. Every write that can claim a table runs inside a transaction holding a
//     per-restaurant Postgres advisory lock, so availability is checked and the
//     row inserted atomically with respect to other writers for that restaurant.
//  2. The database itself rejects overlapping active reservations for a table
//     (EXCLUDE constraint "Reservation_no_overlap"), so even a bug in (1) cannot
//     produce a double booking. That violation is translated to SLOT_UNAVAILABLE.
// ---------------------------------------------------------------------------

function isOverlapViolation(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? "");
  const meta = JSON.stringify((e as { meta?: unknown })?.meta ?? "");
  return /Reservation_no_overlap|23P01/.test(msg) || /Reservation_no_overlap|23P01/.test(meta);
}

function isCodeCollision(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    JSON.stringify(e.meta ?? "").includes("confirmationCode")
  );
}

/** Test seam: lets tests widen the check-then-insert gap to prove the lock/constraint close it. No-op in production. */
export const testHooks: { afterAvailabilityCheck?: () => Promise<void> } = {};

async function withRestaurantLock<T>(restaurantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${restaurantId}))`;
          return fn(tx);
        },
        { timeout: 15_000, maxWait: 15_000 },
      );
    } catch (e) {
      if (isOverlapViolation(e)) throw slotUnavailable();
      if (isCodeCollision(e) && attempt < 4) continue; // astronomically rare; regenerate the code
      throw e;
    }
  }
}

const reservationInclude = {
  restaurant: { select: { id: true, name: true, slug: true, timezone: true, slotLengthMinutes: true } },
  table: { select: { id: true, name: true, capacity: true } },
} satisfies Prisma.ReservationInclude;

export type ReservationView = Prisma.ReservationGetPayload<{ include: typeof reservationInclude }>;

function notice(r: ReservationView): ReservationNotice {
  return {
    confirmationCode: r.confirmationCode,
    restaurantName: r.restaurant.name,
    guestName: r.guestName,
    guestEmail: r.guestEmail,
    partySize: r.partySize,
    startsAt: r.startsAt,
  };
}

async function safeNotify(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.error("[notify] failed", e); // never fail a booking because a notice failed
  }
}

// ---------------------------------------------------------------------------
// Diner: create
// ---------------------------------------------------------------------------

export interface CreateOnlineInput {
  restaurantSlug: string;
  startsAt: Date;
  partySize: number;
  guest: { name: string; email: string; phone: string };
  userId?: string | null;
  notes?: string;
  now?: Date;
}

export async function createOnlineReservation(input: CreateOnlineInput): Promise<ReservationView> {
  const now = input.now ?? new Date();
  const found = await prisma.restaurant.findUnique({ where: { slug: input.restaurantSlug }, select: { id: true } });
  if (!found) throw notFound("Restaurant");

  const created = await withRestaurantLock(found.id, async (tx) => {
    const tz = (await tx.restaurant.findUniqueOrThrow({ where: { id: found.id }, select: { timezone: true } })).timezone;
    const date = utcToLocalParts(input.startsAt, tz).date;
    const data = await loadAvailabilityData(tx, found.id, date);
    if (!data) throw notFound("Restaurant");

    const slots = generateSlots({
      date,
      timezone: tz,
      hours: data.hours,
      tables: data.tables,
      reservations: data.reservations,
      blocks: data.blocks,
      slotLengthMinutes: data.restaurant.slotLengthMinutes,
      slotIntervalMinutes: data.restaurant.slotIntervalMinutes,
      leadTimeMinutes: data.restaurant.leadTimeMinutes,
      maxPartySize: data.restaurant.maxPartySize,
      partySize: input.partySize,
      now,
    });
    const slot = slots.find((s) => s.startsAt.getTime() === input.startsAt.getTime());
    if (!slot) throw slotUnavailable();
    await testHooks.afterAvailabilityCheck?.();

    return tx.reservation.create({
      data: {
        confirmationCode: generateConfirmationCode(),
        restaurantId: found.id,
        tableId: slot.tableId,
        userId: input.userId ?? null,
        guestName: input.guest.name,
        guestEmail: input.guest.email.toLowerCase(),
        guestPhone: input.guest.phone,
        partySize: input.partySize,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        source: "ONLINE",
        notes: input.notes ?? "",
      },
      include: reservationInclude,
    });
  });

  await safeNotify(() => getNotifier().reservationConfirmed(notice(created)));
  return created;
}

// ---------------------------------------------------------------------------
// Staff: walk-in / phone bookings (scoped to the actor's restaurant)
// ---------------------------------------------------------------------------

export interface CreateStaffInput {
  restaurantId: string;
  startsAt: Date;
  partySize: number;
  guest: { name: string; email?: string; phone?: string };
  source: Extract<ReservationSource, "WALK_IN" | "PHONE">;
  tableId?: string;
  durationMinutes?: number;
  notes?: string;
  now?: Date;
}

export async function createStaffReservation(input: CreateStaffInput): Promise<ReservationView> {
  const now = input.now ?? new Date();
  if (input.startsAt.getTime() < now.getTime() - 3 * 3600_000) {
    throw badRequest("Start time is too far in the past.");
  }

  const created = await withRestaurantLock(input.restaurantId, async (tx) => {
    const restaurant = await tx.restaurant.findUnique({
      where: { id: input.restaurantId },
      select: { timezone: true, slotLengthMinutes: true },
    });
    if (!restaurant) throw notFound("Restaurant");
    const date = utcToLocalParts(input.startsAt, restaurant.timezone).date;
    const data = await loadAvailabilityData(tx, input.restaurantId, date);
    if (!data) throw notFound("Restaurant");

    const endsAt = new Date(input.startsAt.getTime() + (input.durationMinutes ?? restaurant.slotLengthMinutes) * 60_000);
    let candidates = data.tables;
    if (input.tableId) {
      candidates = data.tables.filter((t) => t.id === input.tableId);
      if (candidates.length === 0) throw notFound("Table");
      if (candidates[0].capacity < input.partySize) throw badRequest("That table is too small for the party.");
    }
    const table = findFreeTable({
      tables: candidates,
      reservations: data.reservations,
      blocks: data.blocks,
      startsAt: input.startsAt,
      endsAt,
      partySize: input.partySize,
    });
    if (!table) throw slotUnavailable();

    return tx.reservation.create({
      data: {
        confirmationCode: generateConfirmationCode(),
        restaurantId: input.restaurantId,
        tableId: table.id,
        guestName: input.guest.name,
        guestEmail: (input.guest.email ?? "").toLowerCase(),
        guestPhone: input.guest.phone ?? "",
        partySize: input.partySize,
        startsAt: input.startsAt,
        endsAt,
        source: input.source,
        status: input.source === "WALK_IN" ? "SEATED" : "CONFIRMED",
        notes: input.notes ?? "",
      },
      include: reservationInclude,
    });
  });

  if (created.guestEmail) await safeNotify(() => getNotifier().reservationConfirmed(notice(created)));
  return created;
}

// ---------------------------------------------------------------------------
// Diner: view / modify / cancel (proof = confirmation code + email, or owning user)
// ---------------------------------------------------------------------------

export interface Proof {
  email?: string;
  userId?: string | null;
}

function proofMatches(r: Pick<Reservation, "guestEmail" | "userId">, proof: Proof): boolean {
  if (proof.userId && r.userId === proof.userId) return true;
  return !!proof.email && !!r.guestEmail && r.guestEmail.toLowerCase() === proof.email.toLowerCase();
}

export async function getReservationWithProof(code: string, proof: Proof, db: Db = prisma): Promise<ReservationView> {
  const r = await db.reservation.findUnique({ where: { confirmationCode: code }, include: reservationInclude });
  // Same error whether the code is unknown or the proof is wrong (no enumeration).
  if (!r || !proofMatches(r, proof)) throw notFound("Reservation");
  return r;
}

export interface ModifyInput {
  startsAt?: Date;
  partySize?: number;
  notes?: string;
  now?: Date;
}

export async function modifyReservation(code: string, proof: Proof, input: ModifyInput): Promise<ReservationView> {
  const now = input.now ?? new Date();
  const existing = await getReservationWithProof(code, proof);
  if (existing.status !== "CONFIRMED" || existing.startsAt.getTime() <= now.getTime()) {
    throw conflict("NOT_MODIFIABLE", "This reservation can no longer be changed online.");
  }

  const updated = await withRestaurantLock(existing.restaurantId, async (tx) => {
    // Re-read inside the lock: it may have been cancelled/seated meanwhile.
    const current = await tx.reservation.findUniqueOrThrow({ where: { id: existing.id } });
    if (current.status !== "CONFIRMED") throw conflict("NOT_MODIFIABLE", "This reservation can no longer be changed online.");

    const startsAt = input.startsAt ?? current.startsAt;
    const partySize = input.partySize ?? current.partySize;
    const tz = existing.restaurant.timezone;
    const date = utcToLocalParts(startsAt, tz).date;
    const data = await loadAvailabilityData(tx, existing.restaurantId, date);
    if (!data) throw notFound("Restaurant");

    const slots = generateSlots({
      date,
      timezone: tz,
      hours: data.hours,
      tables: data.tables,
      reservations: data.reservations,
      blocks: data.blocks,
      slotLengthMinutes: data.restaurant.slotLengthMinutes,
      slotIntervalMinutes: data.restaurant.slotIntervalMinutes,
      leadTimeMinutes: data.restaurant.leadTimeMinutes,
      maxPartySize: data.restaurant.maxPartySize,
      partySize,
      now,
      excludeReservationId: current.id,
    });
    const slot = slots.find((s) => s.startsAt.getTime() === startsAt.getTime());
    if (!slot) throw slotUnavailable();

    // Keep the same table where possible so the guest is not shuffled needlessly.
    const table = findFreeTable({
      tables: data.tables,
      reservations: data.reservations,
      blocks: data.blocks,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      partySize,
      excludeReservationId: current.id,
      preferTableId: current.tableId,
    });
    if (!table) throw slotUnavailable();

    return tx.reservation.update({
      where: { id: current.id },
      data: {
        tableId: table.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        partySize,
        notes: input.notes ?? current.notes,
      },
      include: reservationInclude,
    });
  });

  await safeNotify(() => getNotifier().reservationModified(notice(updated)));
  return updated;
}

export async function cancelReservation(code: string, proof: Proof, now = new Date()): Promise<ReservationView> {
  const existing = await getReservationWithProof(code, proof);
  if (existing.status !== "CONFIRMED" || existing.startsAt.getTime() <= now.getTime()) {
    throw conflict("NOT_CANCELLABLE", "This reservation can no longer be cancelled online. Please contact the restaurant.");
  }
  const res = await prisma.reservation.updateMany({
    where: { id: existing.id, status: "CONFIRMED" },
    data: { status: "CANCELLED" },
  });
  if (res.count === 0) throw conflict("NOT_CANCELLABLE", "This reservation can no longer be cancelled online.");
  const updated = await prisma.reservation.findUniqueOrThrow({ where: { id: existing.id }, include: reservationInclude });
  await safeNotify(() => getNotifier().reservationCancelled(notice(updated)));
  return updated;
}

export async function listReservationsForUser(userId: string) {
  return prisma.reservation.findMany({
    where: { userId },
    orderBy: { startsAt: "desc" },
    take: 100,
    include: reservationInclude,
  });
}

// ---------------------------------------------------------------------------
// Restaurant: day view + status changes. EVERY query is scoped by restaurantId.
// ---------------------------------------------------------------------------

export async function listDayForRestaurant(restaurantId: string, date: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, timezone: true, slotLengthMinutes: true, openingHours: true },
  });
  if (!restaurant) throw notFound("Restaurant");
  const { start, end } = localDayRangeUtc(date, restaurant.timezone);
  const [tables, reservations, blocks] = await Promise.all([
    prisma.table.findMany({ where: { restaurantId, active: true }, orderBy: [{ capacity: "asc" }, { name: "asc" }] }),
    prisma.reservation.findMany({
      where: { restaurantId, startsAt: { lt: end }, endsAt: { gt: start } },
      orderBy: { startsAt: "asc" },
      include: reservationInclude,
    }),
    prisma.block.findMany({ where: { restaurantId, startsAt: { lt: end }, endsAt: { gt: start } }, orderBy: { startsAt: "asc" } }),
  ]);
  return { restaurant, tables, reservations, blocks };
}

const TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  CONFIRMED: ["SEATED", "NO_SHOW", "CANCELLED"],
  SEATED: ["COMPLETED", "CONFIRMED"],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

export async function setReservationStatus(
  restaurantId: string,
  reservationId: string,
  next: ReservationStatus,
): Promise<ReservationView> {
  // Scoped lookup: another restaurant's reservation is indistinguishable from a missing one.
  const r = await prisma.reservation.findFirst({ where: { id: reservationId, restaurantId } });
  if (!r) throw notFound("Reservation");
  if (!TRANSITIONS[r.status].includes(next)) {
    throw conflict("INVALID_TRANSITION", `Cannot change a ${r.status.toLowerCase().replace("_", " ")} reservation to ${next.toLowerCase().replace("_", " ")}.`);
  }
  const res = await prisma.reservation.updateMany({
    where: { id: r.id, restaurantId, status: r.status },
    data: { status: next },
  });
  if (res.count === 0) throw conflict("STALE_STATUS", "This reservation was just updated by someone else. Refresh and try again.");
  const updated = await prisma.reservation.findUniqueOrThrow({ where: { id: r.id }, include: reservationInclude });
  if (next === "CANCELLED") await safeNotify(() => getNotifier().reservationCancelled(notice(updated)));
  return updated;
}

export { ACTIVE_STATUSES };
