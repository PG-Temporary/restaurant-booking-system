import Link from "next/link";
import { LoginForm } from "@/components/AuthForms";

export default function LoginPage() {
  return (
    <>
      <h1>Sign in</h1>
      <LoginForm />
      <p className="muted">New here? <Link href="/register">Create an account</Link>. Diners can also book without one.</p>
    </>
  );
}
