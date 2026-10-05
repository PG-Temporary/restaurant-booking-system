import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/SignOutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "TableFinder - find and book a table",
  description: "Find restaurants with tables available near you and book instantly. Restaurants manage their bookings in one place.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="inner">
            <Link href="/" className="brand">TableFinder</Link>
            <nav aria-label="Main">
              <Link href="/">Find a table</Link>
              <Link href="/manage">Manage a booking</Link>
              {user?.role === "OWNER" ? <Link href="/dashboard">Restaurant dashboard</Link> : null}
              {user?.role === "DINER" ? <Link href="/account">My bookings</Link> : null}
              {user ? (
                <SignOutButton />
              ) : (
                <>
                  <Link href="/login">Sign in</Link>
                  <Link href="/register" className="btn small">Sign up</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
