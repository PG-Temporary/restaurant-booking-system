import Link from "next/link";
import { z } from "zod";
import { DayView } from "@/components/DayView";
import { prisma } from "@/lib/db";
import { formatDateLong, todayIn } from "@/lib/format";
import { requireOwnerPage } from "@/lib/owner-page";
import { dateStr } from "@/lib/schemas";
import { addDays, dayOfWeekOf } from "@/lib/time";
import { reservationDto } from "@/services/dto";
import { listDayForRestaurant } from "@/services/reservations";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { restaurantId } = await requireOwnerPage();
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { name: true, timezone: true, _count: { select: { tables: true, openingHours: true } } },
  });
  const today = todayIn(restaurant.timezone);
  const parsed = z.object({ date: dateStr }).safeParse(await searchParams);
  const date = parsed.success ? parsed.data.date : today;
  const day = await listDayForRestaurant(restaurantId, date);
  const dow = dayOfWeekOf(date);
  const setupIncomplete = restaurant._count.tables === 0 || restaurant._count.openingHours === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{restaurant.name}</h1>
          <p className="lede" style={{ marginTop: 6 }}>{formatDateLong(date)}{date === today ? ", today" : ""}</p>
        </div>
        <div className="date-nav">
          <Link className="btn secondary small" href={`/dashboard?date=${addDays(date, -1)}`}>← Previous</Link>
          <Link className="btn secondary small" href="/dashboard">Today</Link>
          <Link className="btn secondary small" href={`/dashboard?date=${addDays(date, 1)}`}>Next →</Link>
          <form method="get" className="row" style={{ gap: 6, alignItems: "center" }}>
            <input type="date" name="date" defaultValue={date} aria-label="Jump to date" style={{ minHeight: 38 }} />
            <button className="secondary small" type="submit">Go</button>
          </form>
        </div>
      </div>

      {setupIncomplete ? (
        <p className="alert info" role="status">
          Your restaurant isn&apos;t visible to diners yet. <Link href="/dashboard/setup">Add opening hours and at least one table</Link> to start taking bookings.
        </p>
      ) : null}

      <DayView
        date={date}
        today={today}
        timezone={day.restaurant.timezone}
        tables={day.tables.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity }))}
        reservations={day.reservations.map(reservationDto)}
        blocks={day.blocks.map((b) => ({ id: b.id, tableId: b.tableId, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), reason: b.reason }))}
        hours={day.restaurant.openingHours.filter((h) => h.dayOfWeek === dow).map((h) => ({ opensAt: h.opensAt, closesAt: h.closesAt }))}
      />
    </>
  );
}
