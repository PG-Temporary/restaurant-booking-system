import { z } from "zod";
import { defineRoute } from "@/lib/route";
import { confirmationCodeSchema, dateStr, partySizeSchema } from "@/lib/schemas";
import { getRestaurantAvailability } from "@/services/search";

const params = z.object({ slug: z.string().min(1).max(80) });
const query = z.object({ date: dateStr, partySize: partySizeSchema, excludeCode: confirmationCodeSchema.optional() });

export const GET = defineRoute({ auth: "public", params, query }, async ({ params, query }) =>
  getRestaurantAvailability({ slug: params.slug, ...query }),
);
