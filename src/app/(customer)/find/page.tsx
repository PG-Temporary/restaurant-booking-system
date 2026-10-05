import Link from "next/link";
import { z } from "zod";
import { SearchForm } from "@/components/SearchForm";
import { AppError } from "@/lib/errors";
import { formatDateLong, todayIn } from "@/lib/format";
import { dateStr, partySizeSchema, timeStr } from "@/lib/schemas";
import { addDays } from "@/lib/time";
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
const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default async function FindPage({ searchParams }: { searchParams: Promise<SP> }) {
  const raw = await searchParams;
  const today = todayIn("Europe/London");
  const values = {
    location: first(raw.location) ?? "",
    radiusKm: first(raw.radiusKm) ?? "5",
    date: first(raw.date) ?? addDays(today, 1),
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

  const link = (patch: Record<string, string>) => `/find?${new URLSearchParams({ ...(values as Record<string, string>), ...patch })}`;

  return (
    <>
      <div className="rise" style={stagger(0)}>
        <h1>Find a table near you</h1>
        <p className="lede">Only restaurants with a free table for your party are shown.</p>
      </div>

      <div className="rise" style={{ ...stagger(1), marginTop: 22 }}>
        <SearchForm defaults={values} today={today} />
      </div>

      {error ? <p className="alert error" role="alert">{error}</p> : null}

      {results ? (
        <section aria-live="polite">
          <div className="results-head">
            <h2 style={{ margin: 0 }}>
              {results.length === 0 ? "No free tables" : `${results.length} restaurant${results.length === 1 ? "" : "s"} near ${centreName}`}
            </h2>
            <p className="muted small" style={{ margin: "6px 0 0" }}>{formatDateLong(values.date)} · party of {values.partySize}</p>
          </div>
          {results.length === 0 ? (
            <div className="card empty">
              <h3>Nothing free for that search</h3>
              <p className="muted">Tables fill up fast. Widen the search or try another day.</p>
              <div className="chips">
                <Link className="btn secondary small" href={link({ radiusKm: "25" })}>Search within 25 km</Link>
                <Link className="btn secondary small" href={link({ date: addDays(values.date, 1) })}>Try the next day</Link>
                <Link className="btn secondary small" href={link({ from: "", to: "" })}>Any time of day</Link>
              </div>
            </div>
          ) : (
            <div className="results">
              {results.map((r, i) => (
                <article className="card rcard rise" style={stagger(i + 2)} key={r.id}>
                  <h3><Link href={`/restaurants/${r.slug}?date=${values.date}&partySize=${values.partySize}`}>{r.name}</Link></h3>
                  <div className="meta row" style={{ gap: "2px 14px" }}>
                    <span>{r.address ? `${r.address}, ` : ""}{r.city}</span>
                    <span>{r.distanceKm} km away</span>
                  </div>
                  {r.description ? <p style={{ margin: "2px 0 0" }}>{r.description}</p> : null}
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
