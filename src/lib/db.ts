// One single, reused Prisma client.
// Reason: in dev mode Next.js reloads modules on every change ("hot reload").
// Without this pattern each reload would create a new client -> too many DB connections.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// In production hot reload is not a concern; there the client must not hang off global.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
