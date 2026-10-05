import { AuthFrame } from "@/components/AuthFrame";
import { RegisterForm } from "@/components/AuthForms";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const audience = (await searchParams).as === "business" ? "business" : "customer";
  return (
    <AuthFrame mode="register" audience={audience}>
      <RegisterForm defaultRole={audience === "business" ? "OWNER" : "DINER"} />
    </AuthFrame>
  );
}
