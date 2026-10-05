import Link from "next/link";
import { RegisterForm } from "@/components/AuthForms";

export default function RegisterPage() {
  return (
    <>
      <h1>Create an account</h1>
      <RegisterForm />
      <p className="muted">Already registered? <Link href="/login">Sign in</Link>.</p>
    </>
  );
}
