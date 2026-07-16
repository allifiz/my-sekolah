import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
    throw new Error("DATABASE_URL dan DIRECT_URL wajib tersedia untuk bootstrap database baru.");
  }

execFileSync(
  process.execPath,
  [
    require.resolve("prisma/build/index.js"),
    "db",
    "push",
    "--skip-generate",
  ],
  {
    stdio: "inherit",
    env: process.env,
  },
);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Invitation"
    ADD COLUMN IF NOT EXISTS "roleKey" TEXT NOT NULL DEFAULT 'school-owner'
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GuardianAccount" (
      "id" TEXT NOT NULL,
      "guardianId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "schoolId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "GuardianAccount_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "GuardianAccount_guardianId_key" ON "GuardianAccount"("guardianId")`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "GuardianAccount_userId_key" ON "GuardianAccount"("userId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GuardianAccount_schoolId_idx" ON "GuardianAccount"("schoolId")`);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "GuardianAccount" ADD CONSTRAINT "GuardianAccount_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "GuardianAccount" ADD CONSTRAINT "GuardianAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "GuardianAccount" ADD CONSTRAINT "GuardianAccount_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GuardianInvitation" (
      "id" TEXT NOT NULL,
      "guardianId" TEXT NOT NULL,
      "schoolId" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "acceptedAt" TIMESTAMP(3),
      "createdById" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "GuardianInvitation_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "GuardianInvitation_tokenHash_key" ON "GuardianInvitation"("tokenHash")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GuardianInvitation_guardianId_createdAt_idx" ON "GuardianInvitation"("guardianId", "createdAt")`);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "GuardianInvitation" ADD CONSTRAINT "GuardianInvitation_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "GuardianInvitation" ADD CONSTRAINT "GuardianInvitation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "GuardianInvitation" ADD CONSTRAINT "GuardianInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  console.log("Bootstrap database baru selesai.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
