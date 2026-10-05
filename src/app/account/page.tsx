import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { formatDateTime, STATUS_LABEL } from "@/lib/format";
import { listReservationsForUser } from "@/services/reservations";

export const dynamic = "force-dynamic";

export default async function Account() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "OWNER") redirect("/dashboard");
  const reservations = await listReservationsForUser(session.user.id);

  return (
    <>
      <h1>My bookings</h1>
      {reservations.length === 0 ? (
        <p>No bookings yet. <Link href="/">Find a table</Link>.</p>
      ) : (
        <div className="grid">
          {reservations.map((r) => (
            <article className="card" key={r.id}>
              <h3>{r.restaurant.name} <span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span></h3>
              <div>{formatDateTime(r.startsAt, r.restaurant.timezone)} · party of {r.partySize}</div>
              <div className="small"><Link href={`/reservations/${r.confirmationCode}`}>View / change · {r.confirmationCode}</Link></div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
