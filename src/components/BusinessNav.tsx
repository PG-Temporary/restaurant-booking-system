"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Bookings" },
  { href: "/dashboard/blocks", label: "Closures & blocks" },
  { href: "/dashboard/setup", label: "Setup" },
];

// One nav, rendered as the sidebar rail (tablet/desktop) or a scrolling tab strip (phone).
export function BusinessNav({ variant }: { variant: "rail" | "top" }) {
  const path = usePathname();
  return (
    <nav className={variant === "rail" ? "rail-nav" : undefined} aria-label={variant === "rail" ? "Restaurant" : "Restaurant sections"}>
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={variant === "rail" ? "rail-link" : undefined} aria-current={path === i.href ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
