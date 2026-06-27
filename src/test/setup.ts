import { config } from "dotenv";

// Load .env.test before Prisma opens any connection so tests never point at the
// developer database by accident. override: true makes the test DB authoritative.
config({ path: ".env.test", override: true });
