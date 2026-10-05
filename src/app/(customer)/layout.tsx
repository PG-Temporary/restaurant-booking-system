import { auth } from "@/auth";
import { CustomerNav } from "@/components/CustomerNav";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <div className="cshell">
      <CustomerNav role={session?.user?.role ?? null} />
      <main id="main" className="cmain">{children}</main>
    </div>
  );
}
