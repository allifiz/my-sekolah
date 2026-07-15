-- CreateTable
CREATE TABLE "HomeroomAssignment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "schoolMemberId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeroomAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomeroomAssignment_schoolId_isActive_idx" ON "HomeroomAssignment"("schoolId", "isActive");
CREATE INDEX "HomeroomAssignment_classGroupId_isActive_idx" ON "HomeroomAssignment"("classGroupId", "isActive");
CREATE INDEX "HomeroomAssignment_schoolMemberId_isActive_idx" ON "HomeroomAssignment"("schoolMemberId", "isActive");

-- AddForeignKey
ALTER TABLE "HomeroomAssignment" ADD CONSTRAINT "HomeroomAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeroomAssignment" ADD CONSTRAINT "HomeroomAssignment_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeroomAssignment" ADD CONSTRAINT "HomeroomAssignment_schoolMemberId_fkey" FOREIGN KEY ("schoolMemberId") REFERENCES "SchoolMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
