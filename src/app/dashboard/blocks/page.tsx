import { BlocksManager } from "@/components/BlocksManager";
import { prisma } from "@/lib/db";
import { todayIn } from "@/lib/format";
import { requireOwnerPage } from "@/lib/owner-page";
import { listBlocks } from "@/services/restaurants";

export const dynamic = "force-dynamic";

export default async function BlocksPage() {
  const { restaurantId } = await requireOwnerPage();
  const [blocks, tables, r] = await Promise.all([
    listBlocks(restaurantId),
    prisma.table.findMany({ where: { restaurantId, active: true }, orderBy: { name: "asc" } }),
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { timezone: true } }),
  ]);
  return (
    <>
      <h1>Closures &amp; blocks</h1>
      <p className="muted">Block a whole day, or part of a day, for the entire restaurant or a single table. Existing bookings must be moved or cancelled first.</p>
      <BlocksManager
        timezone={r.timezone}
        today={todayIn(r.timezone)}
        tables={tables.map((t) => ({ id: t.id, name: t.name }))}
        blocks={blocks.map((b) => ({ id: b.id, tableName: b.table?.name ?? null, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), reason: b.reason }))}
      />
    </>
  );
}
