import { PrismaClient } from "@prisma/client";
import { DEMO_PASSWORD, seedDemo } from "./seed-data.ts";

const prisma = new PrismaClient();
try {
  const { ownerEmails } = await seedDemo(prisma);
  console.log("Seeded 5 restaurants, a demo diner and a local gazetteer.");
  console.log(`Demo password for every account: ${DEMO_PASSWORD}`);
  console.log("Owner logins:", ownerEmails.join(", "));
  console.log("Diner login: diner@example.com");
} finally {
  await prisma.$disconnect();
}
