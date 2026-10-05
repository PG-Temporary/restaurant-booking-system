import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { BookForm } from "@/components/BookForm";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { isoInstant, partySizeSchema } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { getPublicRestaurant } from "@/services/search";

export const dynamic = "force-dynamic";

const sp = z.object({ startsAt: isoInstant, partySize: partySizeSchema });

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const parsed = sp.safeParse(await searchParams);
  let restaurant;
  try {
    restaurant = await getPublicRestaurant(slug);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  if (!parsed.success) {
    return (
      <>
        <h1>Book at {restaurant.name}</h1>
        <p className="alert error">That booking link is invalid. <Link href={`/restaurants/${slug}`}>Choose a time</Link>.</p>
      </>
    );
  }
  const { startsAt, partySize } = parsed.data;
  const session = await auth();
  const user = session?.user?.role === "DINER" ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true } }) : null;

  return (
    <>
      <h1>Book at {restaurant.name}</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <strong>{formatDateTime(startsAt, restaurant.timezone)}</strong>
        <div className="muted">Party of {partySize} · table held for {restaurant.slotLengthMinutes} minutes</div>
      </div>
      <BookForm
        slug={slug}
        startsAtIso={startsAt.toISOString()}
        partySize={partySize}
        defaults={{ name: user?.name ?? "", email: user?.email ?? "" }}
        signedIn={!!user}
      />
      <p className="muted small">No account needed. You&apos;ll get a confirmation code to change or cancel your booking.</p>
    </>
  );
}
