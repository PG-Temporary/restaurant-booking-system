import Link from "next/link";
import { BusinessNav } from "@/components/BusinessNav";
import { SignOutButton } from "@/components/SignOutButton";
import { prisma } from "@/lib/db";
import { requireOwnerPage } from "@/lib/owner-page";

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const { restaurantId } = await requireOwnerPage();
  const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true } });
  return (
    <div className="bshell">
      <aside className="rail" aria-label="Restaurant navigation">
        <Link href="/dashboard" className="brand">Table<span>Finder</span></Link>
        <div className="rail-org">
          <small>Signed in as</small>
          <strong>{restaurant.name}</strong>
        </div>
        <BusinessNav variant="rail" />
        <div className="rail-foot">
          <Link href="/?switch=1" className="btn secondary small">Switch</Link>
          <SignOutButton />
        </div>
      </aside>
      <div>
        <header className="btop">
          <div className="btop-row">
            <Link href="/dashboard" className="brand">Table<span>Finder</span></Link>
            <Link href="/?switch=1" className="switch">Switch</Link>
            <SignOutButton />
          </div>
          <BusinessNav variant="top" />
        </header>
        <main id="main" className="bmain">{children}</main>
      </div>
    </div>
  );
}
