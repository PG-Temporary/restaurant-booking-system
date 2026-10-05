import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./test-db.ts";

// Apply migrations (including the overlap constraint) to the dedicated test DB.
export default function setup() {
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
