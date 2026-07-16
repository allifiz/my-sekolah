"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAnnouncementManager() {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");

  const member = await prisma.schoolMember.findFirst({
    where: {
      schoolId: session.user.schoolId,
      userId: session.user.id,
      status: "ACTIVE",
      deletedAt: null,
      roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal"] } } } },
    },
    select: { id: true },
  });
  if (!member) redirect("/school?error=forbidden");

  return { actorId: session.user.id, schoolId: session.user.schoolId };
}

export async function deleteDraftAnnouncement(formData: FormData) {
  const actor = await requireAnnouncementManager();
  const announcementId = z.string().uuid().safeParse(formData.get("announcementId"));
  if (!announcementId.success) redirect("/school/announcements?error=invalid-request");

  const rows = await prisma.$queryRaw<Array<{ id: string; title: string; status: string }>>(Prisma.sql`
    SELECT "id", "title", "status"
    FROM "Announcement"
    WHERE "id" = ${announcementId.data} AND "schoolId" = ${actor.schoolId}
    LIMIT 1
  `);
  const announcement = rows[0];
  if (!announcement) redirect("/school/announcements?error=not-found");
  if (announcement.status !== "DRAFT") redirect("/school/announcements?error=delete-draft-only");

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "AnnouncementRead" WHERE "announcementId" = ${announcement.id} AND "schoolId" = ${actor.schoolId}
    `);
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "Announcement" WHERE "id" = ${announcement.id} AND "schoolId" = ${actor.schoolId} AND "status" = 'DRAFT'
    `);
    await tx.auditLog.create({
      data: {
        schoolId: actor.schoolId,
        actorId: actor.actorId,
        action: "announcement.deleted",
        entityType: "Announcement",
        entityId: announcement.id,
        oldValue: { title: announcement.title, status: announcement.status },
      },
    });
  });

  revalidatePath("/school/announcements");
  revalidatePath("/school/announcements/feed");
  redirect("/school/announcements?success=deleted");
}
