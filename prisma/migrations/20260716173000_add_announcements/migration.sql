CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED');
CREATE TYPE "AnnouncementAudience" AS ENUM ('SCHOOL', 'CLASS_GROUP');

CREATE TABLE "Announcement" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "classGroupId" TEXT,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
  "audience" "AnnouncementAudience" NOT NULL DEFAULT 'SCHOOL',
  "publishAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "unpublishedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnnouncementRead" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "schoolMemberId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Announcement_schoolId_status_publishAt_idx" ON "Announcement"("schoolId", "status", "publishAt");
CREATE INDEX "Announcement_classGroupId_status_idx" ON "Announcement"("classGroupId", "status");
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_schoolMemberId_key" ON "AnnouncementRead"("announcementId", "schoolMemberId");
CREATE INDEX "AnnouncementRead_schoolId_schoolMemberId_idx" ON "AnnouncementRead"("schoolId", "schoolMemberId");

ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "SchoolMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_schoolMemberId_fkey" FOREIGN KEY ("schoolMemberId") REFERENCES "SchoolMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
