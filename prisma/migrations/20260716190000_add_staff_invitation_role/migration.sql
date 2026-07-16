ALTER TABLE "Invitation" ADD COLUMN "roleKey" TEXT NOT NULL DEFAULT 'school-owner';
CREATE INDEX "Invitation_schoolId_roleKey_status_idx" ON "Invitation"("schoolId", "roleKey", "status");
