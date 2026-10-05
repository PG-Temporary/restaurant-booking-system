// Auth.js owns this route (sign-in, sign-out, session, CSRF). Its inputs are
// validated by Auth.js itself and by the Zod `loginSchema` inside `authorize`
// (see src/auth.ts) - the one route not built with defineRoute().
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
