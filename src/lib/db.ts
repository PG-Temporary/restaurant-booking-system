import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

/** The restaurant an owner account runs (tenant scope), or null. */
export const restaurantIdOfOwner = (ownerId: string) =>
  prisma.restaurant.findUnique({ where: { ownerId }, select: { id: true } }).then((r) => r?.id ?? null);
