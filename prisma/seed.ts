import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// This first allowlist entry bootstraps closed access; keep it lowercase because allowlist emails are stored normalized.
const ADMIN_EMAIL = "volkertjaden@gmail.com";

// Seeds the first allowed email and promotes the matching user after they have been provisioned by login.
async function main() {
  // Upsert makes the seed idempotent: repeated runs keep one canonical allowlist row.
  await prisma.allowlistEntry.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: { email: ADMIN_EMAIL },
  });
  console.log(`Allowlist enabled: ${ADMIN_EMAIL}`);

  // The user only exists after the first successful Google login, so the initial seed run may update zero rows.
  await prisma.user.updateMany({
    where: { email: ADMIN_EMAIL },
    data: { isAdmin: true },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
