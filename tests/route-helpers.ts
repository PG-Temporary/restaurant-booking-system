import { vi } from "vitest";
import { auth } from "@/auth";

type Role = "DINER" | "OWNER";

export function signInAs(userId: string, role: Role) {
  vi.mocked(auth).mockResolvedValue({ user: { id: userId, role }, expires: "2999-01-01" } as never);
}
export function signOut() {
  vi.mocked(auth).mockResolvedValue(null as never);
}

export const url = (path: string, query?: Record<string, string | number | undefined>) => {
  const u = new URL(`http://localhost${path}`);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) u.searchParams.set(k, String(v));
  return u.toString();
};

export const jsonReq = (method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>) =>
  new Request(url(path, query), {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
