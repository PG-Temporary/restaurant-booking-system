import { AuthFrame } from "@/components/AuthFrame";
import { LoginForm } from "@/components/AuthForms";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const audience = (await searchParams).as === "business" ? "business" : "customer";
  return (
    <AuthFrame mode="login" audience={audience}>
      <LoginForm />
    </AuthFrame>
  );
}
