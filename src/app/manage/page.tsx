import { redirect } from "next/navigation";
import { z } from "zod";
import { confirmationCodeSchema, emailSchema } from "@/lib/schemas";

const sp = z.object({ code: confirmationCodeSchema, email: emailSchema });

export default async function ManageLookup({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = await searchParams;
  if (raw.code || raw.email) {
    const parsed = sp.safeParse(raw);
    if (parsed.success) redirect(`/reservations/${parsed.data.code}?email=${encodeURIComponent(parsed.data.email)}`);
  }
  return (
    <>
      <h1>Manage a booking</h1>
      <p className="muted">Enter the confirmation code and the email you booked with. Signed-in diners can find bookings under <a href="/account">My bookings</a>.</p>
      {raw.code || raw.email ? <p className="alert error" role="alert">Please enter a valid 8-character code and email.</p> : null}
      <form className="card row" method="get">
        <label>Confirmation code<input name="code" required maxLength={8} minLength={8} style={{ textTransform: "uppercase" }} /></label>
        <label>Email<input type="email" name="email" required /></label>
        <button type="submit">Find booking</button>
      </form>
    </>
  );
}
