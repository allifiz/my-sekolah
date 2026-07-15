"use server";

import { randomUUID } from "crypto";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const optionalDate = z.preprocess((value) => {
  const text = String(value ?? "").trim();
  return text ? new Date(text) : undefined;
}, z.date().optional());

const announcementSchema = z.object({
  title: z.string().trim().min(3).max(180),
  content: z.string().trim().min(10).max(10_000),
  audience: z.enum(["SCHOOL", "CLASS_GROUP"]),
  classGroupId: z.preprocess((value) => String(value ?? "").trim() || undefined, z.string().cuid().optional()),
  publishAt: optionalDate,
  expiresAt: optionalDate,
  submitMode: z.enum(["DRAFT", "PUBLISH"]),
});

const reasonSchema = z.object({
  announcementId: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
});

type AnnouncementRow = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "UNPUBLISHED";
  audience: "SCHOOL" | "CLASS_GROUP";
  classGroupId: string | null;
};

async function requireMember() {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");

  const member = await prisma.schoolMember.findFirst({
    where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null },
    include: {
      roles: { include: { role: true } },
      homeroomAssignments: { where: { isActive: true }, select: { classGroupId: true } },
    },
  });
  if (!member) redirect("/school?error=forbidden");

  const roleKeys = member.roles.map(({ role }) => role.key);
  const canManage = roleKeys.some((key) => ["school-owner", "school-admin", "principal"].includes(key));
  return {
    actorId: session.user.id,
    schoolId: session.user.schoolId,
    memberId: member.id,
    canManage,
    assignedClassGroupIds: member.homeroomAssignments.map((item) => item.classGroupId),
  };
}

export async function createAnnouncement(formData: FormData) {
  const actor = await requireMember();
  if (!actor.canManage) redirect("/school/announcements?error=forbidden");

  const parsed = announcementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/announcements?error=invalid-announcement");
  const data = parsed.data;
  if (data.audience === "CLASS_GROUP" && !data.classGroupId) redirect("/school/announcements?error=class-required");
  if (data.expiresAt && data.publishAt && data.expiresAt <= data.publishAt) redirect("/school/announcements?error=invalid-schedule");

  if (data.classGroupId) {
    const group = await prisma.classGroup.findFirst({ where: { id: data.classGroupId, schoolId: actor.schoolId }, select: { id: true } });
    if (!group) redirect("/school/announcements?error=class-not-found");
  }

  const id = randomUUID();
  const publishNow = data.submitMode === "PUBLISH" && (!data.publishAt || data.publishAt <= new Date());
  const status = data.submitMode === "PUBLISH" ? "PUBLISHED" : "DRAFT";
  const publishAt = data.submitMode === "PUBLISH" ? data.publishAt ?? new Date() : data.publishAt ?? null;

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "Announcement" (
      "id", "schoolId", "classGroupId", "title", "content", "status", "audience",
      "publishAt", "expiresAt", "publishedAt", "createdById", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${actor.schoolId}, ${data.classGroupId ?? null}, ${data.title}, ${data.content},
      CAST(${status} AS "AnnouncementStatus"), CAST(${data.audience} AS "AnnouncementAudience"),
      ${publishAt}, ${data.expiresAt ?? null}, ${publishNow ? new Date() : null}, ${actor.memberId}, NOW(), NOW()
    )
  `);

  await prisma.auditLog.create({
    data: {
      schoolId: actor.schoolId,
      actorId: actor.actorId,
      action: data.submitMode === "PUBLISH" ? "announcement.published" : "announcement.created",
      entityType: "Announcement",
      entityId: id,
      newValue: {
        title: data.title,
        audience: data.audience,
        classGroupId: data.classGroupId,
        publishAt: publishAt?.toISOString(),
        expiresAt: data.expiresAt?.toISOString(),
        status,
      },
    },
  });

  revalidatePath("/school/announcements");
  revalidatePath("/school/announcements/feed");
  redirect("/school/announcements?success=created");
}

export async function publishAnnouncement(formData: FormData) {
  const actor = await requireMember();
  if (!actor.canManage) redirect("/school/announcements?error=forbidden");
  const id = String(formData.get("announcementId") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/school/announcements?error=invalid-request");

  const rows = await prisma.$queryRaw<AnnouncementRow[]>(Prisma.sql`
    SELECT "id", "title", "status", "audience", "classGroupId"
    FROM "Announcement" WHERE "id" = ${id} AND "schoolId" = ${actor.schoolId} LIMIT 1
  `);
  const announcement = rows[0];
  if (!announcement) redirect("/school/announcements?error=not-found");

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Announcement"
    SET "status" = 'PUBLISHED', "publishAt" = COALESCE("publishAt", NOW()), "publishedAt" = NOW(), "unpublishedAt" = NULL, "updatedAt" = NOW()
    WHERE "id" = ${id} AND "schoolId" = ${actor.schoolId}
  `);
  await prisma.auditLog.create({
    data: { schoolId: actor.schoolId, actorId: actor.actorId, action: "announcement.published", entityType: "Announcement", entityId: id, oldValue: { status: announcement.status }, newValue: { status: "PUBLISHED" } },
  });
  revalidatePath("/school/announcements");
  revalidatePath("/school/announcements/feed");
  redirect("/school/announcements?success=published");
}

export async function unpublishAnnouncement(formData: FormData) {
  const actor = await requireMember();
  if (!actor.canManage) redirect("/school/announcements?error=forbidden");
  const parsed = reasonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/announcements?error=reason-required");

  const rows = await prisma.$queryRaw<AnnouncementRow[]>(Prisma.sql`
    SELECT "id", "title", "status", "audience", "classGroupId"
    FROM "Announcement" WHERE "id" = ${parsed.data.announcementId} AND "schoolId" = ${actor.schoolId} LIMIT 1
  `);
  const announcement = rows[0];
  if (!announcement) redirect("/school/announcements?error=not-found");

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Announcement"
    SET "status" = 'UNPUBLISHED', "unpublishedAt" = NOW(), "updatedAt" = NOW()
    WHERE "id" = ${announcement.id} AND "schoolId" = ${actor.schoolId}
  `);
  await prisma.auditLog.create({
    data: {
      schoolId: actor.schoolId,
      actorId: actor.actorId,
      action: "announcement.unpublished",
      entityType: "Announcement",
      entityId: announcement.id,
      reason: parsed.data.reason,
      oldValue: { status: announcement.status },
      newValue: { status: "UNPUBLISHED" },
    },
  });
  revalidatePath("/school/announcements");
  revalidatePath("/school/announcements/feed");
  redirect("/school/announcements?success=unpublished");
}

export async function markAnnouncementRead(formData: FormData) {
  const actor = await requireMember();
  const id = String(formData.get("announcementId") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/school/announcements/feed?error=invalid-request");

  const accessible = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT a."id"
    FROM "Announcement" a
    WHERE a."id" = ${id}
      AND a."schoolId" = ${actor.schoolId}
      AND a."status" = 'PUBLISHED'
      AND COALESCE(a."publishAt", NOW()) <= NOW()
      AND (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
      AND (
        a."audience" = 'SCHOOL'
        OR ${actor.canManage}
        OR a."classGroupId" IN (${Prisma.join(actor.assignedClassGroupIds.length ? actor.assignedClassGroupIds : ["__none__"])})
      )
    LIMIT 1
  `);
  if (!accessible[0]) redirect("/school/announcements/feed?error=not-found");

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "AnnouncementRead" ("id", "schoolId", "announcementId", "schoolMemberId", "readAt")
    VALUES (${randomUUID()}, ${actor.schoolId}, ${id}, ${actor.memberId}, NOW())
    ON CONFLICT ("announcementId", "schoolMemberId") DO UPDATE SET "readAt" = EXCLUDED."readAt"
  `);
  revalidatePath("/school/announcements/feed");
  redirect("/school/announcements/feed?success=read");
}
