import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AvailabilityForm } from "@/components/AvailabilityForm";
import { AppError } from "@/lib/errors";
import { formatDateLong, todayIn } from "@/lib/format";
import { dateStr, partySizeSchema } from "@/lib/schemas";
import { addDays } from "@/lib/time";
import { getPublicRestaurant, getRestaurantAvailability } from "@/services/search";

export const dynamic = "force-dynamic";

const sp = z.object({ date: dateStr.optional(), partySize: partySizeSchema.optional() });
const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

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
  const today = todayIn(restaurant.timezone);
  const date = (parsed.success && parsed.data.date) || addDays(today, 1);
  const partySize = Math.min((parsed.success && parsed.data.partySize) || 2, restaurant.maxPartySize);
  const availability = await getRestaurantAvailability({ slug, date, partySize });

  return (
    <>
      <div className="rise" style={stagger(0)}>
        <Link href="/find" className="small">← Back to search</Link>
        <h1 style={{ marginTop: 10 }}>{restaurant.name}</h1>
        <p className="muted" style={{ margin: "8px 0 0" }}>{[restaurant.address, restaurant.city, restaurant.postcode].filter(Boolean).join(", ")}</p>
        {restaurant.description ? <p className="lede">{restaurant.description}</p> : null}
      </div>

      <div className="rise" style={{ ...stagger(1), marginTop: 22 }}>
        <AvailabilityForm slug={slug} date={date} partySize={partySize} today={today} maxParty={restaurant.maxPartySize} />
      </div>

      <section className="rise" style={stagger(2)} aria-live="polite">
        <h2>{formatDateLong(date)}</h2>
        <p className="muted small" style={{ marginTop: -6 }}>Party of {partySize}. Tables are held for {restaurant.slotLengthMinutes} minutes. Times are local ({restaurant.timezone}).</p>
        {availability.slots.length === 0 ? (
          <div className="card empty">
            <h3>No tables free that day</h3>
            <p className="muted">Try another date from the strip above, or a smaller party.</p>
          </div>
        ) : (
          <div className="slots">
            {availability.slots.map((s) => (
              <Link key={s.startsAt} className="slot" href={`/book/${slug}?startsAt=${encodeURIComponent(s.startsAt)}&partySize=${partySize}`}>{s.label}</Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
