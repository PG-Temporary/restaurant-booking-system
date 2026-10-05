import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { formatDateTime, STATUS_LABEL } from "@/lib/format";
import { listReservationsForUser } from "@/services/reservations";

export const dynamic = "force-dynamic";
const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default async function Account() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "OWNER") redirect("/dashboard");
  const reservations = await listReservationsForUser(session.user.id);

  return (
    <>
      <h1>My bookings</h1>
      {reservations.length === 0 ? (
        <div className="card empty" style={{ marginTop: 22 }}>
          <h2>No bookings yet</h2>
          <p className="muted">When you book while signed in, it shows up here.</p>
          <div><Link className="btn" href="/find">Find a table</Link></div>
        </div>
      ) : (
        <div className="results" style={{ marginTop: 22 }}>
          {reservations.map((r, i) => (
            <article className="card rcard rise" style={stagger(i)} key={r.id}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <h3>{r.restaurant.name}</h3>
                <span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
              </div>
              <div>{formatDateTime(r.startsAt, r.restaurant.timezone)}, party of {r.partySize}</div>
              <div className="small"><Link href={`/reservations/${r.confirmationCode}`}>View or change booking {r.confirmationCode}</Link></div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
