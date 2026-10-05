import { z } from "zod";
import { defineRoute } from "@/lib/route";
import { dateStr, partySizeSchema, timeStr } from "@/lib/schemas";
import { searchAvailability } from "@/services/search";

const query = z.object({
  location: z.string().trim().min(2).max(60),
  radiusKm: z.coerce.number().min(0.5).max(50).default(5),
  date: dateStr,
  partySize: partySizeSchema,
  from: timeStr.optional(),
  to: timeStr.optional(),
});

export const GET = defineRoute({ auth: "public", query }, async ({ query }) => searchAvailability(query));
