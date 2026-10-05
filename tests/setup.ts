import { TEST_DATABASE_URL } from "./test-db.ts";

// Must run before any module creates a PrismaClient.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret";
