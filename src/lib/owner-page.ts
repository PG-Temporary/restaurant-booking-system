import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { restaurantIdOfOwner } from "@/lib/db";

/** Server-component guard: signed-in owner with a restaurant, else redirect. */
export async function requireOwnerPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/");
  const restaurantId = await restaurantIdOfOwner(session.user.id);
  if (!restaurantId) redirect("/");
  return { userId: session.user.id, restaurantId };
}
