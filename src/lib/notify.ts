// Notification seam. v1 only logs; replace the body with an email/SMS sender.
// ponytail: console only, add a Notifier interface when a second sender exists.
export function notify(
  event: "confirmed" | "modified" | "cancelled",
  r: { confirmationCode: string; partySize: number; startsAt: Date; restaurant: { name: string } },
): void {
  if (process.env.NODE_ENV === "test") return;
  console.log(
    `[notify] ${event} code=${r.confirmationCode} restaurant="${r.restaurant.name}" party=${r.partySize} at=${r.startsAt.toISOString()}`,
  );
}
