"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

type Role = "DINER" | "OWNER" | null;

const startsWith = (path: string, ...prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export function CustomerNav({ role }: { role: Role }) {
  const path = usePathname();
  const findActive = startsWith(path, "/find", "/restaurants", "/book");
  const bookingsHref = role === "DINER" ? "/account" : "/manage";
  const bookingsActive = startsWith(path, "/account", "/manage", "/reservations");
  const cur = (on: boolean) => (on ? ("page" as const) : undefined);

  return (
    <>
      <header className="ctop">
        <div className="ctop-inner">
          <Link href="/find" className="brand">Table<span>Finder</span></Link>
          <nav className="cnav" aria-label="Main">
            <Link href="/find" aria-current={cur(findActive)}>Find a table</Link>
            <Link href={bookingsHref} aria-current={cur(bookingsActive)}>{role === "DINER" ? "My bookings" : "Manage a booking"}</Link>
            {role === "OWNER" ? <Link href="/dashboard">Restaurant dashboard</Link> : null}
            {role ? (
              <button type="button" className="secondary small" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button>
            ) : (
              <>
                <Link href="/login" aria-current={cur(path === "/login")}>Sign in</Link>
                <Link href="/register" className="btn small">Sign up</Link>
              </>
            )}
          </nav>
          <Link href="/?switch=1" className="switch" aria-label="Switch between customer and business">Switch</Link>
        </div>
      </header>

      <nav className="tabbar" aria-label="Main">
        <Link href="/find" className="tab" aria-current={cur(findActive)}>Find</Link>
        <Link href={bookingsHref} className="tab" aria-current={cur(bookingsActive)}>Bookings</Link>
        {role ? (
          <button type="button" className="tab" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button>
        ) : (
          <Link href="/login" className="tab" aria-current={cur(path === "/login" || path === "/register")}>Sign in</Link>
        )}
      </nav>
    </>
  );
}
