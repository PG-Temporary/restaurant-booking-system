import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role?: "DINER" | "OWNER";
  }
  interface Session {
    user: { id: string; role: "DINER" | "OWNER"; name?: string | null; email?: string | null };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: "DINER" | "OWNER";
  }
}
