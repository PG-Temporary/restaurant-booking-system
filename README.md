# Restaurant Booking System

A two-sided restaurant booking platform on one backend:

- **Diners** search for restaurants *that actually have a table free* near them (city or postcode + radius, date, party size, time window), book as a guest or with an account, and view / change / cancel their booking.
- **Restaurants** onboard (hours, tables, booking rules), see a day view of bookings by table, move parties through `confirmed → seated → completed / no-show / cancelled`, add walk-in and phone bookings, and block out dates or tables. Each restaurant only ever sees its own data.

## Stack

TypeScript · Next.js 15 (App Router) · PostgreSQL 16 via Prisma 6 · Zod · Auth.js v5 (email + password) · Vitest. No other runtime dependencies.

## Getting started

Requires Node 22+ and a running PostgreSQL (with the `btree_gist` extension, which ships with standard Postgres).

```bash
npm install
cp .env.example .env          # then fill in the values (see below)
createdb booking && createdb booking_test
npm run db:migrate            # applies migrations, incl. the no-double-booking constraint
npm run db:seed               # 5 demo restaurants, a demo diner, a small location gazetteer
npm run dev                   # http://localhost:3000
```

### Environment variables (names only)

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string for the app |
| `TEST_DATABASE_URL` | Separate Postgres database used by `npm test` (migrated automatically) |
| `AUTH_SECRET` | Auth.js session signing secret (`openssl rand -base64 32`) |
| `AUTH_TRUST_HOST` | Set to `true` when running behind a proxy / on localhost |

### Demo accounts (after `npm run db:seed`)

All use the password `password123`: owners `owner.trattoria@example.com`, `owner.sakura@example.com`, `owner.thames@example.com`, `owner.spice@example.com`, `owner.northern@example.com`; diner `diner@example.com`.
Try the search with location `E1`, a party of 6, and a Friday evening.

## The experience

- **Splash and gateway (`/`).** A live-gradient splash with blur and film grain plays once per browser session (tap, Enter, Space or "Skip" ends it early), then asks "Are you dining or running a restaurant?". The choice is remembered in `localStorage`; the **Switch** control in either shell (or `/?switch=1`) clears it.
- **Customer (mobile first, `/find`, `/restaurants/:slug`, `/book/:slug`, `/reservations/:code`, `/manage`, `/account`).** Bottom tab bar on phones, swipeable date strip, guest stepper, time-of-day chips, a booking summary sheet pinned to the bottom of the screen, and an animated confirmation ticket. No account needed.
- **Business (tablet / desktop first, `/dashboard`, `/dashboard/blocks`, `/dashboard/setup`).** Sidebar rail, a day view with one lane per table on a time axis (with a "now" line), one-tap Seat / No-show / Cancel / Complete from a detail panel with instant feedback, and a "New booking" slide-over for walk-ins and phone bookings. On phones the timeline becomes a chronological agenda.
- **Shared look.** One token set in `src/app/globals.css` (colour, radius, blur, motion, z-index) with automatic light and dark themes, glass surfaces, a drifting aurora backdrop and static film grain. Everything honours `prefers-reduced-motion` (live gradients and loops stop) and `prefers-reduced-transparency`. No UI or animation libraries: CSS and small client components only.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run lint` / `npm run typecheck` / `npm test` | The three checks that must pass |
| `npm run build` / `npm start` | Production build / server |
| `npm run db:seed` | (Re)seed demo data - wipes existing rows |
| `npm run db:reset` | Drop, re-migrate and re-seed the dev DB |

## Architecture decisions

**Double-booking is impossible, enforced twice.**
1. Every write that can claim a table (online booking, walk-in/phone booking, modify, create block) runs in a transaction holding a per-restaurant Postgres advisory lock (`pg_advisory_xact_lock`), so *check availability → insert* is atomic per restaurant.
2. The database itself refuses overlapping active reservations: an `EXCLUDE USING gist` constraint on `(tableId, [startsAt, endsAt))` for `CONFIRMED`/`SEATED` rows (see the hand-written section of `prisma/migrations/*_init/migration.sql`). Even a bug in (1) cannot create a double booking; the violation is translated into a `409 SLOT_UNAVAILABLE`.

`tests/concurrency.test.ts` fires concurrent requests at the last free table. A test seam widens the race window, and the suite was verified to fail when the lock and constraint are removed.

**Availability is computed, never stored.** `src/lib/availability.ts` is a pure module: from opening hours, active tables, active reservations and blocks it derives bookable start times and picks the smallest table that fits the party. No counters to drift. Intervals are half-open, so a booking may start exactly when another ends.

**Time.** All instants are UTC. Opening hours are local wall-clock times in each restaurant's IANA timezone; `src/lib/time.ts` converts with `Intl` only (DST-tested on the London spring-forward / fall-back days). A time skipped by a DST jump resolves to the instant after the jump.

**Multi-tenancy.** Owner routes never accept a restaurant id from the client: it is resolved from the session's user on each request, and every query is scoped by it. Looking up another restaurant's reservation / table / block returns `404`, indistinguishable from "doesn't exist". Covered by `tests/api.test.ts`.

**Every API route is validated and authorised in one place.** Handlers are built with `defineRoute({ auth, params, query, body }, handler)` (`src/lib/route.ts`): authentication/role check first, then Zod validation of path params, query and JSON body (routes without input validate against an empty schema). A test scans `src/app/api/**` and fails if any route bypasses `defineRoute`. The single documented exception is Auth.js's own `/api/auth/[...nextauth]` endpoint, whose credentials are validated with Zod inside `authorize` (`src/auth.ts`).

**Guest bookings.** A guest manages a booking with confirmation code + booking email (a wrong email and an unknown code produce the same 404). Signed-in diners can also manage bookings made while signed in.

**Search without a geocoder.** Typed cities / postcodes resolve against a small `GeoPlace` table (UK cities and a few London outward codes seeded). Restaurants are placed from their postcode/city, or from explicit coordinates entered during setup. To cover more areas, add rows to `GeoPlace` or swap `resolvePlace()` for a real geocoding service.

**Notifications** go through a `Notifier` interface (`src/lib/notify.ts`); v1 ships a console implementation only. Failures to notify never fail a booking.

**Staff vs online rules.** Online bookings respect lead time, opening hours, the booking-time grid and the max online party size. Staff walk-in/phone bookings bypass those (they still can't overlap another booking or block, and must fit the table); walk-ins start as `SEATED`.

**Status flow.** `CONFIRMED → SEATED | NO_SHOW | CANCELLED`, `SEATED → COMPLETED | CONFIRMED`. Seated, completed, no-show and cancelled reservations can't be changed online; cancelled / completed / no-show free the table.

## API overview

| Route | Auth | Notes |
| --- | --- | --- |
| `GET /api/search` | public | `location, radiusKm, date, partySize, from?, to?` |
| `GET /api/restaurants/:slug/availability` | public | `date, partySize, excludeCode?` |
| `POST /api/reservations` | public (guest or diner) | create |
| `GET/PATCH /api/reservations/:code` | code + email, or booker | view / modify |
| `POST /api/reservations/:code/cancel` | code + email, or booker | cancel |
| `GET /api/me/reservations` | diner | my bookings |
| `POST /api/auth/register` | public | diner or owner (owner creates the restaurant) |
| `GET/PUT /api/owner/restaurant` | owner | profile, rules, opening hours |
| `POST /api/owner/tables`, `PATCH /api/owner/tables/:id` | owner | tables are deactivated, never deleted |
| `GET/POST /api/owner/reservations` | owner | day view (`?date=`) / walk-in & phone bookings |
| `PATCH /api/owner/reservations/:id` | owner | status changes |
| `GET/POST /api/owner/blocks`, `DELETE /api/owner/blocks/:id` | owner | closures, whole day or window, restaurant or table |

## Testing

`npm test` runs against a dedicated Postgres database (`TEST_DATABASE_URL`, migrated automatically): pure engine and timezone unit tests, service integration tests, concurrency tests, route-level auth / validation / tenant-isolation tests, and the seeded end-to-end demo (diner finds & books → restaurant sees & seats → second diner can no longer book that table).

## Known limitations (v1)

Out of scope by design: payments/deposits, reviews, SMS/email delivery, mobile app. Also: no overnight service (a window must close before midnight); one owner login per restaurant (no staff accounts); no password reset; no rate limiting on the public endpoints; a booking holds exactly one table (no table combining).
