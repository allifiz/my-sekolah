"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAcademicManager() {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const member = await prisma.schoolMember.findFirst({
    where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal"] } } } } },
    select: { id: true },
  });
  if (!member) redirect("/school?error=forbidden");
  return { actorId: session.user.id, schoolId: session.user.schoolId };
}

export async function deleteGradeLevel(formData: FormData) {
  const actor = await requireAcademicManager();
  const parsed = z.string().cuid().safeParse(formData.get("gradeLevelId"));
  if (!parsed.success) redirect("/school/classes?error=invalid-request");
  const grade = await prisma.gradeLevel.findFirst({ where: { id: parsed.data, schoolId: actor.schoolId }, include: { _count: { select: { classGroups: true } } } });
  if (!grade) redirect("/school/classes?error=not-found");
  if (grade._count.classGroups > 0) redirect("/school/classes?error=grade-in-use");
  await prisma.$transaction([
    prisma.gradeLevel.delete({ where: { id: grade.id } }),
    prisma.auditLog.create({ data: { schoolId: actor.schoolId, actorId: actor.actorId, action: "grade_level.deleted", entityType: "GradeLevel", entityId: grade.id, oldValue: { code: grade.code, name: grade.name, order: grade.order } } }),
  ]);
  revalidatePath("/school/classes");
  redirect("/school/classes?success=grade-deleted");
}

export async function deleteClassGroup(formData: FormData) {
  const actor = await requireAcademicManager();
  const parsed = z.string().cuid().safeParse(formData.get("classGroupId"));
  if (!parsed.success) redirect("/school/classes?error=invalid-request");
  const group = await prisma.classGroup.findFirst({
    where: { id: parsed.data, schoolId: actor.schoolId },
    include: { _count: { select: { enrollments: true, homeroomAssignments: true, attendanceSessions: true } } },
  });
  if (!group) redirect("/school/classes?error=not-found");
  if (group._count.enrollments || group._count.homeroomAssignments || group._count.attendanceSessions) redirect("/school/classes?error=class-in-use");
  await prisma.$transaction([
    prisma.classGroup.delete({ where: { id: group.id } }),
    prisma.auditLog.create({ data: { schoolId: actor.schoolId, actorId: actor.actorId, action: "class_group.deleted", entityType: "ClassGroup", entityId: group.id, oldValue: { name: group.name, capacity: group.capacity } } }),
  ]);
  revalidatePath("/school/classes");
  redirect("/school/classes?success=class-deleted");
}
