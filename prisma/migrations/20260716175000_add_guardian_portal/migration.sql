CREATE TABLE "GuardianAccount" (
  "id" TEXT NOT NULL,
  "guardianId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuardianAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuardianAccount_guardianId_key" ON "GuardianAccount"("guardianId");
CREATE UNIQUE INDEX "GuardianAccount_userId_key" ON "GuardianAccount"("userId");
CREATE INDEX "GuardianAccount_schoolId_idx" ON "GuardianAccount"("schoolId");
ALTER TABLE "GuardianAccount" ADD CONSTRAINT "GuardianAccount_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuardianAccount" ADD CONSTRAINT "GuardianAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuardianAccount" ADD CONSTRAINT "GuardianAccount_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GuardianInvitation" (
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
);
CREATE UNIQUE INDEX "GuardianInvitation_tokenHash_key" ON "GuardianInvitation"("tokenHash");
CREATE INDEX "GuardianInvitation_guardianId_createdAt_idx" ON "GuardianInvitation"("guardianId", "createdAt");
ALTER TABLE "GuardianInvitation" ADD CONSTRAINT "GuardianInvitation_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuardianInvitation" ADD CONSTRAINT "GuardianInvitation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuardianInvitation" ADD CONSTRAINT "GuardianInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;