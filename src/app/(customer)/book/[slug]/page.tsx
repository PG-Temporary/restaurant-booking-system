import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { BookForm } from "@/components/BookForm";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { isoInstant, partySizeSchema } from "@/lib/schemas";
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
        <p className="alert error" role="alert">That booking link is invalid. <Link href={`/restaurants/${slug}`}>Choose a time</Link>.</p>
      </>
    );
  }
  const { startsAt, partySize } = parsed.data;
  const session = await auth();
  const user = session?.user?.role === "DINER" ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true } }) : null;

  return (
    <>
      <Link href={`/restaurants/${slug}`} className="small">← Pick another time</Link>
      <h1 style={{ margin: "10px 0 22px" }}>Book at {restaurant.name}</h1>
      <BookForm
        slug={slug}
        startsAtIso={startsAt.toISOString()}
        partySize={partySize}
        defaults={{ name: user?.name ?? "", email: user?.email ?? "" }}
        restaurantName={restaurant.name}
        whenLabel={formatDateTime(startsAt, restaurant.timezone)}
        holdMinutes={restaurant.slotLengthMinutes}
      />
    </>
  );
}
