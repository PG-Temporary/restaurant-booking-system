"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Phase = "boot" | "splash" | "leaving" | "choose";
type Role = "customer" | "business";

const SPLASH_MS = 2400;
const LEAVE_MS = 520;

// Storage can throw (private windows, blocked cookies): every access is guarded.
const read = (store: "local" | "session", key: string): string | null => {
  try {
    return (store === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
};
const write = (store: "local" | "session", key: string, value: string | null) => {
  try {
    const s = store === "local" ? window.localStorage : window.sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* storage unavailable: the app still works, it just forgets */
  }
};

export function Gateway() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("boot");

  // Decide what to show: remembered role -> straight in; seen splash -> chooser; else splash.
  useEffect(() => {
    const switching = new URLSearchParams(window.location.search).get("switch") === "1";
    if (switching) write("local", "tf-role", null);
    const role = read("local", "tf-role");
    if (!switching && role === "customer") return void router.replace("/find");
    if (!switching && role === "business") return void router.replace("/dashboard");
    setPhase(switching || read("session", "tf-splash") === "1" ? "choose" : "splash");
  }, [router]);

  const finish = useCallback(() => setPhase((p) => (p === "splash" ? "leaving" : p)), []);

  useEffect(() => {
    if (phase !== "splash") return;
    const timer = window.setTimeout(finish, SPLASH_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase, finish]);

  useEffect(() => {
    if (phase !== "leaving") return;
    write("session", "tf-splash", "1");
    const timer = window.setTimeout(() => setPhase("choose"), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const remember = (role: Role) => write("local", "tf-role", role);
  const glow = (e: React.PointerEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

  if (phase === "boot") return <div className="boot" aria-hidden="true" />;

  return (
    <>
      {phase !== "splash" ? (
        <main id="main" className="gate">
          <div className="gate-copy gate-fade">
            <div className="gate-brand">Table<span>Finder</span></div>
            <h1>Are you dining or running a restaurant?</h1>
            <p className="lede">Pick your side. You can switch any time.</p>
          </div>
          <div className="choices">
            <Link className="choice rise" style={stagger(1)} href="/find" onClick={() => remember("customer")} onPointerMove={glow}>
              <span className="choice-title">Customer</span>
              <span className="choice-sub">Find a table</span>
              <span className="choice-go">Start searching →</span>
            </Link>
            <Link className="choice rise" style={stagger(2)} href="/login?as=business" onClick={() => remember("business")} onPointerMove={glow}>
              <span className="choice-title">Business</span>
              <span className="choice-sub">Manage my restaurant</span>
              <span className="choice-go">Open my dashboard →</span>
            </Link>
          </div>
        </main>
      ) : null}

      {phase === "splash" || phase === "leaving" ? (
        <div className="splash" data-leaving={phase === "leaving"} onClick={finish} role="dialog" aria-label="Welcome to TableFinder">
          <div className="splash-blobs" aria-hidden="true">
            <i className="blob b1" /><i className="blob b2" /><i className="blob b3" /><i className="blob b4" />
          </div>
          <div className="splash-veil" aria-hidden="true" />
          <div className="splash-grain" aria-hidden="true" />
          <button type="button" className="skip-splash small" onClick={finish} autoFocus>Skip</button>
          <div className="splash-inner">
            <h1 className="wordmark">Table<span>Finder</span></h1>
            <p className="splash-tag">Find a table. Fill a room.</p>
          </div>
          <div className="splash-progress" aria-hidden="true"><i /></div>
        </div>
      ) : null}
    </>
  );
}
