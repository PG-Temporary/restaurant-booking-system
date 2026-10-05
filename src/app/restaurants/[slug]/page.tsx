import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { dateStr, partySizeSchema } from "@/lib/schemas";
import { addDays } from "@/lib/time";
import { formatDateLong, todayIn } from "@/lib/format";
import { getPublicRestaurant, getRestaurantAvailability } from "@/services/search";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const sp = z.object({ date: dateStr.optional(), partySize: partySizeSchema.optional() });

export default async function RestaurantPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  let restaurant;
  try {
    restaurant = await getPublicRestaurant(slug);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const parsed = sp.safeParse(await searchParams);
  const date = (parsed.success && parsed.data.date) || addDays(todayIn(restaurant.timezone), 1);
  const partySize = (parsed.success && parsed.data.partySize) || 2;
  const availability = await getRestaurantAvailability({ slug, date, partySize });

  return (
    <>
      <h1>{restaurant.name}</h1>
      <p className="muted">{[restaurant.address, restaurant.city, restaurant.postcode].filter(Boolean).join(", ")}</p>
      {restaurant.description ? <p>{restaurant.description}</p> : null}

      <form className="card row" method="get">
        <label>Date<input type="date" name="date" defaultValue={date} min={todayIn(restaurant.timezone)} required /></label>
        <label>Party size<input type="number" name="partySize" min={1} max={restaurant.maxPartySize} defaultValue={partySize} required style={{ width: 90 }} /></label>
        <button type="submit">Check times</button>
      </form>

      <h2>{formatDateLong(date)} · party of {partySize}</h2>
      {availability.slots.length === 0 ? (
        <p>No tables available for that date and party size. Try another day.</p>
      ) : (
        <div className="slots">
          {availability.slots.map((s) => (
            <Link key={s.startsAt} className="slot" href={`/book/${slug}?startsAt=${encodeURIComponent(s.startsAt)}&partySize=${partySize}`}>{s.label}</Link>
          ))}
        </div>
      )}
      <p className="muted small">Times shown in the restaurant&apos;s local time ({restaurant.timezone}). Tables are held for {restaurant.slotLengthMinutes} minutes.</p>
    </>
  );
}
