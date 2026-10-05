import { defineRoute, requireOwner } from "@/lib/route";
import { restaurantUpdateSchema } from "@/lib/schemas";
import { getOwnerRestaurant, updateRestaurant } from "@/services/restaurants";

export const GET = defineRoute({ auth: "owner" }, async ({ actor }) =>
  getOwnerRestaurant(requireOwner(actor).restaurantId),
);

export const PUT = defineRoute({ auth: "owner", body: restaurantUpdateSchema }, async ({ actor, body }) =>
  updateRestaurant(requireOwner(actor).restaurantId, body),
);
