import { defineRoute, requireOwner } from "@/lib/route";
import { tableCreateSchema } from "@/lib/schemas";
import { createTable } from "@/services/restaurants";

export const POST = defineRoute({ auth: "owner", body: tableCreateSchema }, async ({ actor, body }) =>
  Response.json(await createTable(requireOwner(actor).restaurantId, body), { status: 201 }),
);
