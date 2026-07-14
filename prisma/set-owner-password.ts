import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_PLATFORM_OWNER_PASSWORD;

  if (!email || !password) {
    console.info("Owner password bootstrap dilewati karena env belum lengkap.");
    return;
  }

  if (password.length < 12) {
    throw new Error("SEED_PLATFORM_OWNER_PASSWORD minimal 12 karakter.");
  }

  await prisma.user.update({
    where: { email },
    data: { passwordHash: await hash(password, 12) },
  });

  console.info(`Password Platform Owner diperbarui untuk ${email}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });