import Link from "next/link";

export type AuthAudience = "customer" | "business";

const COPY = {
  login: {
    customer: { h: "Welcome back.", p: "Sign in to see and change your bookings. You can also book without an account." },
    business: { h: "Run tonight's room.", p: "Sign in to see bookings, seat parties and manage your tables." },
  },
  register: {
    customer: { h: "Keep your tables.", p: "Create an account and every booking you make shows up in one place." },
    business: { h: "Open your books.", p: "Create your restaurant account, add tables and hours, and start taking bookings." },
  },
} as const;

export function AuthFrame({ mode, audience, children }: { mode: "login" | "register"; audience: AuthAudience; children: React.ReactNode }) {
  const copy = COPY[mode][audience];
  const other = mode === "login" ? "register" : "login";
  return (
    <main id="main" className="auth page-enter">
      <div className="auth-aside">
        <Link href="/" className="brand">Table<span>Finder</span></Link>
        <h1 style={{ marginTop: "clamp(20px, 6vh, 56px)", maxWidth: "12ch" }}>{copy.h}</h1>
        <p>{copy.p}</p>
      </div>
      <div className="auth-main">
        <div className="auth-switch" role="group" aria-label="Account type">
          <Link href={`/${mode}?as=customer`} aria-current={audience === "customer" ? "true" : undefined}>Customer</Link>
          <Link href={`/${mode}?as=business`} aria-current={audience === "business" ? "true" : undefined}>Business</Link>
        </div>
        <div className="card">{children}</div>
        <p className="muted small" style={{ marginTop: 14 }}>
          {mode === "login" ? "New here? " : "Already registered? "}
          <Link href={`/${other}?as=${audience}`}>{mode === "login" ? "Create an account" : "Sign in"}</Link>
          {mode === "login" && audience === "customer" ? ". You can also book without one." : "."}
        </p>
      </div>
    </main>
  );
}
