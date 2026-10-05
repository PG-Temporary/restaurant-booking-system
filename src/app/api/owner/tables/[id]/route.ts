import { z } from "zod";
import { defineRoute, requireOwner } from "@/lib/route";
import { tableUpdateSchema } from "@/lib/schemas";
import { updateTable } from "@/services/restaurants";

const params = z.object({ id: z.string().min(1).max(40) });

// Tables are deactivated (active: false), never hard-deleted, so history stays intact.
export const PATCH = defineRoute({ auth: "owner", params, body: tableUpdateSchema }, async ({ actor, params, body }) =>
  updateTable(requireOwner(actor).restaurantId, params.id, body),
);
