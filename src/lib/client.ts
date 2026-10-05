// Small fetch wrapper for client components talking to our own API.
export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export async function api<T = unknown>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const fieldErrors = json?.error?.details?.fieldErrors as Record<string, string[]> | undefined;
      const first = fieldErrors ? Object.entries(fieldErrors).map(([k, v]) => `${k}: ${v?.[0]}`)[0] : undefined;
      return { ok: false, status: res.status, error: first ?? json?.error?.message ?? "Something went wrong." };
    }
    return { ok: true, status: res.status, data: json as T };
  } catch {
    return { ok: false, status: 0, error: "Network error. Please try again." };
  }
}
