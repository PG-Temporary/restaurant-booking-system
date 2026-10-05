import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { conflict } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/password";
import { slugify } from "@/lib/codes";

export interface RegisterInput {
  role: "DINER" | "OWNER";
  name: string;
  email: string;
  password: string;
  restaurantName?: string;
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await prisma.restaurant.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function registerUser(input: RegisterInput) {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash,
        role: input.role,
        ...(input.role === "OWNER"
          ? { restaurant: { create: { name: input.restaurantName!, slug: await uniqueSlug(input.restaurantName!) } } }
          : {}),
      },
      select: { id: true, email: true, name: true, role: true },
    });
    return user;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw conflict("EMAIL_TAKEN", "An account with that email already exists.");
    }
    throw e;
  }
}

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    // Burn comparable time so account existence is not revealed by latency.
    await verifyPassword(password, "scrypt$00$00");
    return null;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? { id: user.id, email: user.email, name: user.name, role: user.role } : null;
}
