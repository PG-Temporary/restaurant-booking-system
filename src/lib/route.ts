// Every API route handler MUST be created with defineRoute(). It guarantees,
// in one place, that (1) authentication/authorisation runs first and (2) all
// inputs (path params, query string, JSON body) are validated with Zod -
// including routes that take no input (they validate against an empty schema).
import { z, ZodError, type ZodTypeAny } from "zod";
import { auth } from "@/auth";
import { restaurantIdOfOwner } from "@/lib/db";
import { AppError, badRequest, forbidden, unauthorized } from "@/lib/errors";
import { emptySchema } from "@/lib/schemas";

export type AuthMode = "public" | "user" | "owner";

export interface Actor {
  userId: string;
  role: "DINER" | "OWNER";
  /** Set only for OWNER; resolved from the database on every request. */
  restaurantId: string | null;
}

export interface OwnerActor extends Actor {
  role: "OWNER";
  restaurantId: string;
}

type RouteCtx = { params: Promise<Record<string, string | string[]>> };

/**
 * Next.js requires a non-optional second argument on route handlers, so the
 * two-argument overload is declared last (that is the one Next inspects).
 * The one-argument overload exists for routes without path params and tests.
 */
export interface RouteHandler {
  (req: Request): Promise<Response>;
  (req: Request, routeCtx: RouteCtx): Promise<Response>;
}

/** Handlers registered here are the ones created through defineRoute (checked by a test). */
export const definedRoutes = new WeakSet<object>();

export function defineRoute<P extends ZodTypeAny = typeof emptySchema, Q extends ZodTypeAny = typeof emptySchema, B extends ZodTypeAny = typeof emptySchema>(
  opts: { auth: AuthMode; params?: P; query?: Q; body?: B },
  handler: (ctx: {
    actor: Actor | null;
    params: z.infer<P>;
    query: z.infer<Q>;
    body: z.infer<B>;
    req: Request;
  }) => Promise<unknown>,
) {
  const fn = (async (req: Request, routeCtx?: RouteCtx): Promise<Response> => {
    try {
      // 1. Authentication / authorisation (before any input is trusted).
      // Public routes still pick up an optional identity (guest or signed-in diner).
      const session = await auth();
      if (opts.auth !== "public" && !session?.user?.id) throw unauthorized();
      const actor: Actor | null = session?.user?.id
        ? { userId: session.user.id, role: session.user.role, restaurantId: null }
        : null;
      if (opts.auth === "owner" && actor) {
        if (actor.role !== "OWNER") throw forbidden();
        actor.restaurantId = await restaurantIdOfOwner(actor.userId);
        if (!actor.restaurantId) throw forbidden("No restaurant is linked to this account.");
      }

      // 2. Input validation with Zod: params, query, body.
      const rawParams = routeCtx?.params ? await routeCtx.params : {};
      const params = (opts.params ?? emptySchema).parse(rawParams);
      const query = (opts.query ?? emptySchema).parse(Object.fromEntries(new URL(req.url).searchParams));
      let body: unknown = {};
      if (opts.body) {
        let json: unknown;
        try {
          json = await req.json();
        } catch {
          throw badRequest("Request body must be valid JSON.");
        }
        body = opts.body.parse(json);
      }

      const result = await handler({ actor, params, query, body, req } as never);
      return result instanceof Response ? result : Response.json(result ?? { ok: true });
    } catch (err) {
      return toErrorResponse(err);
    }
  }) as RouteHandler;
  definedRoutes.add(fn);
  return fn;
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof ZodError) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input.", details: err.flatten() } },
      { status: 400 },
    );
  }
  if (err instanceof AppError) {
    return Response.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  console.error("[api] unhandled error", err);
  return Response.json({ error: { code: "INTERNAL", message: "Something went wrong." } }, { status: 500 });
}

export function requireOwner(actor: Actor | null): OwnerActor {
  if (!actor || actor.role !== "OWNER" || !actor.restaurantId) throw forbidden();
  return actor as OwnerActor;
}
