import { z } from "zod";
import { defineRoute, requireOwner } from "@/lib/route";
import { deleteBlock } from "@/services/restaurants";

const params = z.object({ id: z.string().min(1).max(40) });

export const DELETE = defineRoute({ auth: "owner", params }, async ({ actor, params }) => {
  await deleteBlock(requireOwner(actor).restaurantId, params.id);
  return { ok: true };
});
