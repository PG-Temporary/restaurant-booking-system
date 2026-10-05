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
      <>
        <h1>Booking not found</h1>
        <p>We couldn&apos;t find a booking with that code and email. <Link href="/manage">Try again</Link>.</p>
      </>
    );
  }

  const tz = reservation.restaurant.timezone;
  const upcoming = reservation.status === "CONFIRMED" && new Date(reservation.startsAt).getTime() > Date.now();
  return (
    <>
      {sp.new ? <p className="alert ok" role="status">You&apos;re booked! Keep your confirmation code safe.</p> : null}
      <h1>{reservation.restaurant.name}</h1>
      <div className="card grid">
        <div><span className={`badge ${reservation.status}`}>{STATUS_LABEL[reservation.status]}</span></div>
        <div><strong>{formatDateTime(reservation.startsAt, tz)}</strong> · party of {reservation.partySize}</div>
        <div>Confirmation code: <strong style={{ letterSpacing: 2, fontSize: "1.2rem" }}>{reservation.confirmationCode}</strong></div>
        <div className="muted small">Under the name {reservation.guestName} · {reservation.guestEmail}</div>
        {reservation.notes ? <div className="muted small">Notes: {reservation.notes}</div> : null}
      </div>
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
        <p className="muted">This booking can no longer be changed online. Please contact the restaurant.</p>
      )}
    </>
  );
}
