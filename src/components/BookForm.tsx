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
  restaurantName: string;
  whenLabel: string;
  holdMinutes: number;
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
    if (!res.ok) {
      setBusy(false);
      setError(res.error ?? "Could not book.");
      setGone(res.status === 409);
      return;
    }
    router.push(`/reservations/${res.data!.confirmationCode}?email=${encodeURIComponent(String(f.get("email")))}&new=1`);
  }

  return (
    <>
      <div className="book-layout">
        <form id="book-form" className="card grid" onSubmit={onSubmit}>
          <h2 style={{ margin: 0 }}>Your details</h2>
          <label>Full name<input name="name" defaultValue={props.defaults.name} required maxLength={100} autoComplete="name" /></label>
          <label>Email<input type="email" name="email" defaultValue={props.defaults.email} required autoComplete="email" inputMode="email" /></label>
          <label>
            Phone
            <input type="tel" name="phone" required minLength={5} maxLength={30} autoComplete="tel" inputMode="tel" />
            <small>So the restaurant can reach you if plans change.</small>
          </label>
          <label>Notes for the restaurant (optional)<textarea name="notes" rows={2} maxLength={500} /></label>
          {error ? (
            <p className="alert error" role="alert">
              {error} {gone ? <Link href={`/restaurants/${props.slug}`}>See other times</Link> : null}
            </p>
          ) : null}
          <p className="muted small" style={{ margin: 0 }}>No account needed. You get a confirmation code to change or cancel.</p>
        </form>

        <aside className="sheet" aria-label="Booking summary">
          <div className="summary">
            <span className="muted small">{props.restaurantName}</span>
            <strong>{props.whenLabel}</strong>
            <span className="muted small">Party of {props.partySize}. Table held for {props.holdMinutes} minutes.</span>
          </div>
          <button type="submit" form="book-form" className="big" disabled={busy}>{busy ? "Booking…" : "Confirm booking"}</button>
        </aside>
      </div>
      <div className="book-spacer" aria-hidden="true" />
    </>
  );
}
