import Link from "next/link";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { dateStr, partySizeSchema, timeStr } from "@/lib/schemas";
import { addDays } from "@/lib/time";
import { formatDateLong, todayIn } from "@/lib/format";
import { TimeSelect } from "@/components/TimeOptions";
import { searchAvailability, type SearchResult } from "@/services/search";

export const dynamic = "force-dynamic";

const searchSchema = z.object({
  location: z.string().trim().min(2).max(60),
  radiusKm: z.coerce.number().min(0.5).max(50).default(5),
  date: dateStr,
  partySize: partySizeSchema,
  from: timeStr.optional().or(z.literal("").transform(() => undefined)),
  to: timeStr.optional().or(z.literal("").transform(() => undefined)),
});

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const raw = await searchParams;
  const tomorrow = addDays(todayIn("Europe/London"), 1);
  const values = {
    location: first(raw.location) ?? "",
    radiusKm: first(raw.radiusKm) ?? "5",
    date: first(raw.date) ?? tomorrow,
    partySize: first(raw.partySize) ?? "2",
    from: first(raw.from) ?? "",
    to: first(raw.to) ?? "",
  };

  let results: SearchResult[] | null = null;
  let centreName = "";
  let error = "";
  if (raw.location !== undefined) {
    const parsed = searchSchema.safeParse(values);
    if (!parsed.success) {
      error = "Please check your search: " + Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    } else {
      try {
        const res = await searchAvailability(parsed.data);
        results = res.results;
        centreName = res.centre.name;
      } catch (e) {
        if (e instanceof AppError) error = e.message;
        else throw e;
      }
    }
  }

  return (
    <>
      <h1>Find a table near you</h1>
      <p className="muted">Only restaurants with a real, bookable table for your party are shown.</p>

      <form className="card row" method="get" action="/">
        <label style={{ flex: "2 1 200px" }}>
          Where
          <input name="location" defaultValue={values.location} placeholder="City or postcode, e.g. London or E1" required minLength={2} />
        </label>
        <label>
          Within
          <select name="radiusKm" defaultValue={values.radiusKm}>
            {[1, 2, 5, 10, 25, 50].map((r) => <option key={r} value={r}>{r} km</option>)}
          </select>
        </label>
        <label>
          Date
          <input type="date" name="date" defaultValue={values.date} min={todayIn("Europe/London")} required />
        </label>
        <label>
          Party size
          <input type="number" name="partySize" min={1} max={50} defaultValue={values.partySize} required style={{ width: 90 }} />
        </label>
        <label>
          From
          <TimeSelect name="from" defaultValue={values.from} anyLabel="Any" />
        </label>
        <label>
          To
          <TimeSelect name="to" defaultValue={values.to} anyLabel="Any" />
        </label>
        <button type="submit">Search</button>
      </form>

      {error ? <p className="alert error" role="alert">{error}</p> : null}

      {results ? (
        <section aria-live="polite">
          <h2>
            {results.length === 0
              ? "No tables available"
              : `${results.length} restaurant${results.length === 1 ? "" : "s"} with tables near ${centreName}`}
          </h2>
          <p className="muted small">{formatDateLong(values.date)} · party of {values.partySize}</p>
          {results.length === 0 ? (
            <p>Try a wider radius, a different time window, or another date.</p>
          ) : (
            <div className="grid">
              {results.map((r) => (
                <article className="card" key={r.id}>
                  <h3><Link href={`/restaurants/${r.slug}?date=${values.date}&partySize=${values.partySize}`}>{r.name}</Link></h3>
                  <div className="muted small">{r.address ? `${r.address}, ` : ""}{r.city} · {r.distanceKm} km away</div>
                  {r.description ? <p style={{ margin: "6px 0" }}>{r.description}</p> : null}
                  <div className="slots" role="list" aria-label={`Available times at ${r.name}`}>
                    {r.slots.map((s) => (
                      <Link key={s.startsAt} role="listitem" className="slot" href={`/book/${r.slug}?startsAt=${encodeURIComponent(s.startsAt)}&partySize=${values.partySize}`}>
                        {s.label}
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
