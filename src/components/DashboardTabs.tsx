"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Bookings" },
  { href: "/dashboard/blocks", label: "Closures & blocks" },
  { href: "/dashboard/setup", label: "Setup" },
];

export function DashboardTabs() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Dashboard">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined}>{t.label}</Link>
      ))}
    </nav>
  );
}
