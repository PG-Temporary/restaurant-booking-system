import { defineRoute } from "@/lib/route";
import { registerSchema } from "@/lib/schemas";
import { registerUser } from "@/services/users";

export const POST = defineRoute({ auth: "public", body: registerSchema }, async ({ body }) => {
  const user = await registerUser(body);
  return Response.json({ id: user.id, role: user.role }, { status: 201 });
});
