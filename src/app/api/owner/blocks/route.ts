import { z } from "zod";
import { defineRoute, requireOwner } from "@/lib/route";
import { dateStr, isoInstant } from "@/lib/schemas";
import { createBlock, listBlocks, wholeDayRange } from "@/services/restaurants";

// Either an explicit [startsAt, endsAt) window, or a whole local `date`.
const body = z
  .object({
    tableId: z.string().min(1).max(40).nullish(),
    reason: z.string().trim().max(200).default(""),
    startsAt: isoInstant.optional(),
    endsAt: isoInstant.optional(),
    date: dateStr.optional(),
  })
  .refine((b) => !!b.date !== (!!b.startsAt || !!b.endsAt), "Provide either `date`, or both `startsAt` and `endsAt`")
  .refine((b) => !!b.date || (!!b.startsAt && !!b.endsAt), "Provide both `startsAt` and `endsAt`");

const iso = (b: Awaited<ReturnType<typeof listBlocks>>[number]) => ({
  id: b.id,
  tableId: b.tableId,
  tableName: b.table?.name ?? null,
  startsAt: b.startsAt.toISOString(),
  endsAt: b.endsAt.toISOString(),
  reason: b.reason,
});

export const GET = defineRoute({ auth: "owner" }, async ({ actor }) => ({
  blocks: (await listBlocks(requireOwner(actor).restaurantId)).map(iso),
}));

export const POST = defineRoute({ auth: "owner", body }, async ({ actor, body }) => {
  const { restaurantId } = requireOwner(actor);
  const range = body.date ? await wholeDayRange(restaurantId, body.date) : { start: body.startsAt!, end: body.endsAt! };
  const block = await createBlock(restaurantId, {
    tableId: body.tableId ?? null,
    startsAt: range.start,
    endsAt: range.end,
    reason: body.reason,
  });
  return Response.json({ id: block.id }, { status: 201 });
});
