import { DashboardTabs } from "@/components/DashboardTabs";
import { requireOwnerPage } from "@/lib/owner-page";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerPage();
  return (
    <>
      <DashboardTabs />
      {children}
    </>
  );
}
