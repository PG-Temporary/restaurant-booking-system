"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export function BookForm(props: {
  slug: string;
  startsAtIso: string;
  partySize: number;
  defaults: { name: string; email: string };
  signedIn: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gone, setGone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const res = await api<{ confirmationCode: string }>("/api/reservations", "POST", {
      restaurantSlug: props.slug,
      startsAt: props.startsAtIso,
      partySize: props.partySize,
      guest: { name: f.get("name"), email: f.get("email"), phone: f.get("phone") },
      notes: String(f.get("notes") ?? "") || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not book.");
      setGone(res.status === 409);
      return;
    }
    router.push(`/reservations/${res.data!.confirmationCode}?email=${encodeURIComponent(String(f.get("email")))}&new=1`);
  }

  return (
    <form className="card grid" onSubmit={onSubmit}>
      <label>Full name<input name="name" defaultValue={props.defaults.name} required maxLength={100} autoComplete="name" /></label>
      <label>Email<input type="email" name="email" defaultValue={props.defaults.email} required autoComplete="email" /></label>
      <label>Phone<input type="tel" name="phone" required minLength={5} maxLength={30} autoComplete="tel" /></label>
      <label>Notes for the restaurant (optional)<textarea name="notes" rows={2} maxLength={500} /></label>
      {error ? (
        <p className="alert error" role="alert">
          {error} {gone ? <Link href={`/restaurants/${props.slug}`}>See other times</Link> : null}
        </p>
      ) : null}
      <div><button type="submit" disabled={busy}>{busy ? "Booking…" : "Confirm booking"}</button></div>
    </form>
  );
}
