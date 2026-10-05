import Link from "next/link";
import { z } from "zod";
import { DayView } from "@/components/DayView";
import { WalkInForm } from "@/components/WalkInForm";
import { prisma } from "@/lib/db";
import { formatDateLong, todayIn } from "@/lib/format";
import { requireOwnerPage } from "@/lib/owner-page";
import { dateStr } from "@/lib/schemas";
import { addDays } from "@/lib/time";
import { reservationDto } from "@/services/dto";
import { listDayForRestaurant } from "@/services/reservations";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { restaurantId } = await requireOwnerPage();
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { name: true, timezone: true, _count: { select: { tables: true, openingHours: true } } },
  });
  const parsed = z.object({ date: dateStr }).safeParse(await searchParams);
  const date = parsed.success ? parsed.data.date : todayIn(restaurant.timezone);
  const day = await listDayForRestaurant(restaurantId, date);
  const setupIncomplete = restaurant._count.tables === 0 || restaurant._count.openingHours === 0;

  return (
    <>
      <h1>{restaurant.name}</h1>
      {setupIncomplete ? (
        <p className="alert info" role="status">
          Your restaurant isn&apos;t visible to diners yet. <Link href="/dashboard/setup">Add opening hours and at least one table</Link> to start taking bookings.
        </p>
      ) : null}

      <div className="row" style={{ alignItems: "center", marginBottom: 12 }}>
        <Link className="btn secondary small" href={`/dashboard?date=${addDays(date, -1)}`}>← Previous</Link>
        <strong style={{ flex: "0 1 auto" }}>{formatDateLong(date)}</strong>
        <Link className="btn secondary small" href={`/dashboard?date=${addDays(date, 1)}`}>Next →</Link>
        <Link className="btn secondary small" href="/dashboard">Today</Link>
        <form method="get" className="row" style={{ marginLeft: "auto" }}>
          <input type="date" name="date" defaultValue={date} aria-label="Jump to date" />
          <button className="secondary small" type="submit">Go</button>
        </form>
      </div>

      <DayView
        timezone={day.restaurant.timezone}
        tables={day.tables.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity }))}
        reservations={day.reservations.map(reservationDto)}
        blocks={day.blocks.map((b) => ({ id: b.id, tableId: b.tableId, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), reason: b.reason }))}
      />

      <h2>Add a walk-in or phone booking</h2>
      <WalkInForm date={date} timezone={day.restaurant.timezone} tables={day.tables.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity }))} />
    </>
  );
}
