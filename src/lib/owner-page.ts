import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/** Server-component guard: signed-in owner with a restaurant, else redirect. */
export async function requireOwnerPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/");
  const restaurant = await prisma.restaurant.findUnique({ where: { ownerId: session.user.id }, select: { id: true } });
  if (!restaurant) redirect("/");
  return { userId: session.user.id, restaurantId: restaurant.id };
}
