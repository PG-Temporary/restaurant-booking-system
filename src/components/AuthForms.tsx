"use client";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const res = await signIn("credentials", { email: f.get("email"), password: f.get("password"), redirect: false });
    setBusy(false);
    if (!res || res.error) return setError("Incorrect email or password.");
    router.push("/account");
    router.refresh();
  }
  return (
    <form className="grid" onSubmit={onSubmit}>
      <label>Email<input type="email" name="email" required autoComplete="email" /></label>
      <label>Password<input type="password" name="password" required autoComplete="current-password" /></label>
      {error ? <p className="alert error" role="alert">{error}</p> : null}
      <div><button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></div>
    </form>
  );
}

export function RegisterForm({ defaultRole = "DINER" }: { defaultRole?: "DINER" | "OWNER" }) {
  const router = useRouter();
  const [role, setRole] = useState<"DINER" | "OWNER">(defaultRole);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const payload = {
      role,
      name: f.get("name"),
      email: f.get("email"),
      password: f.get("password"),
      ...(role === "OWNER" ? { restaurantName: f.get("restaurantName") } : {}),
    };
    const res = await api("/api/auth/register", "POST", payload);
    if (!res.ok) {
      setBusy(false);
      return setError(res.error ?? "Could not sign up.");
    }
    const login = await signIn("credentials", { email: f.get("email"), password: f.get("password"), redirect: false });
    setBusy(false);
    if (!login || login.error) return router.push("/login");
    router.push(role === "OWNER" ? "/dashboard/setup" : "/account");
    router.refresh();
  }
  return (
    <form className="grid" onSubmit={onSubmit}>
      <fieldset style={{ border: 0, padding: 0, display: "flex", gap: 16 }}>
        <legend className="muted small">I am a…</legend>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" checked={role === "DINER"} onChange={() => setRole("DINER")} /> Diner</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" checked={role === "OWNER"} onChange={() => setRole("OWNER")} /> Restaurant owner</label>
      </fieldset>
      <label>Your name<input name="name" required maxLength={100} autoComplete="name" /></label>
      {role === "OWNER" ? <label>Restaurant name<input name="restaurantName" required maxLength={120} /></label> : null}
      <label>Email<input type="email" name="email" required autoComplete="email" /></label>
      <label>Password (8+ characters)<input type="password" name="password" required minLength={8} autoComplete="new-password" /></label>
      {error ? <p className="alert error" role="alert">{error}</p> : null}
      <div><button type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button></div>
    </form>
  );
}
