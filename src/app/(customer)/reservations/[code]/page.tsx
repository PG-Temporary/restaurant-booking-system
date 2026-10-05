import Link from "next/link";
import { auth } from "@/auth";
import { ManageReservation } from "@/components/ManageReservation";
import { AppError } from "@/lib/errors";
import { formatDateTime, STATUS_LABEL } from "@/lib/format";
import { confirmationCodeSchema, emailSchema } from "@/lib/schemas";
import { reservationDto } from "@/services/dto";
import { getReservationWithProof } from "@/services/reservations";

export const dynamic = "force-dynamic";

export default async function ReservationPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const code = confirmationCodeSchema.safeParse((await params).code);
  const sp = await searchParams;
  const email = emailSchema.safeParse(sp.email ?? "");
  const session = await auth();

  let reservation = null;
  if (code.success) {
    try {
      reservation = reservationDto(
        await getReservationWithProof(code.data, { email: email.success ? email.data : undefined, userId: session?.user?.id }),
      );
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
    }
  }

  if (!reservation) {
    return (
      <div className="card empty">
        <h1>Booking not found</h1>
        <p className="muted">We couldn&apos;t find a booking with that code and email.</p>
        <div><Link className="btn" href="/manage">Try again</Link></div>
      </div>
    );
  }

  const tz = reservation.restaurant.timezone;
  const upcoming = reservation.status === "CONFIRMED" && new Date(reservation.startsAt).getTime() > Date.now();
  const justBooked = !!sp.new;

  return (
    <>
      <section className="card ticket rise" aria-label="Your booking">
        {justBooked ? (
          <>
            <svg className="check" viewBox="0 0 72 72" aria-hidden="true">
              <circle cx="36" cy="36" r="30" />
              <path d="M22 37 L32 47 L50 26" />
            </svg>
            <p role="status" style={{ margin: 0, fontWeight: 650 }}>You&apos;re booked! Keep your confirmation code safe.</p>
          </>
        ) : null}
        <div>
          <span className={`badge ${reservation.status}`}>{STATUS_LABEL[reservation.status]}</span>
          <h1 style={{ marginTop: 12 }}>{reservation.restaurant.name}</h1>
        </div>
        <div>
          <strong style={{ fontSize: "1.15rem" }}>{formatDateTime(reservation.startsAt, tz)}</strong>
          <div className="muted">Party of {reservation.partySize}</div>
        </div>
        <hr className="ticket-rule" />
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted small">Confirmation code</span>
          <strong className="code">{reservation.confirmationCode}</strong>
        </div>
        <div className="muted small">Under the name {reservation.guestName}, {reservation.guestEmail}</div>
        {reservation.notes ? <div className="muted small">Notes: {reservation.notes}</div> : null}
      </section>

      {upcoming ? (
        <ManageReservation
          code={reservation.confirmationCode}
          email={email.success ? email.data : undefined}
          slug={reservation.restaurant.slug}
          partySize={reservation.partySize}
          startsAtIso={reservation.startsAt}
          timezone={tz}
        />
      ) : (
        <p className="muted" style={{ marginTop: 18 }}>This booking can no longer be changed online. Please contact the restaurant.</p>
      )}
    </>
  );
}
