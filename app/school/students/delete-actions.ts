"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireStudentManager() {
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

export async function unlinkStudentGuardian(formData: FormData) {
  const actor = await requireStudentManager();
  const relationId = z.string().cuid().safeParse(formData.get("relationId"));
  if (!relationId.success) redirect("/school/students?error=invalid-request");

  const relation = await prisma.studentGuardian.findFirst({
    where: { id: relationId.data, schoolId: actor.schoolId },
    include: { student: true, guardian: true },
  });
  if (!relation) redirect("/school/students?error=relation-not-found");

  await prisma.$transaction([
    prisma.studentGuardian.delete({ where: { id: relation.id } }),
    prisma.auditLog.create({
      data: {
        schoolId: actor.schoolId,
        actorId: actor.actorId,
        action: "student_guardian.unlinked",
        entityType: "StudentGuardian",
        entityId: relation.id,
        oldValue: {
          studentId: relation.studentId,
          student: relation.student.name,
          guardianId: relation.guardianId,
          guardian: relation.guardian.name,
          relationship: relation.relationship,
          isPrimary: relation.isPrimary,
        },
      },
    }),
  ]);

  revalidatePath("/school/students");
  redirect("/school/students?success=guardian-unlinked");
}

export async function cancelEnrollment(formData: FormData) {
  const actor = await requireStudentManager();
  const enrollmentId = z.string().cuid().safeParse(formData.get("enrollmentId"));
  if (!enrollmentId.success) redirect("/school/students?error=invalid-request");

  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId.data, schoolId: actor.schoolId, status: "ACTIVE" },
    include: { student: true, classGroup: true, academicYear: true },
  });
  if (!enrollment) redirect("/school/students?error=enrollment-not-found");

  await prisma.$transaction([
    prisma.enrollment.update({ where: { id: enrollment.id }, data: { status: "CANCELLED" } }),
    prisma.auditLog.create({
      data: {
        schoolId: actor.schoolId,
        actorId: actor.actorId,
        action: "enrollment.cancelled",
        entityType: "Enrollment",
        entityId: enrollment.id,
        oldValue: {
          status: enrollment.status,
          student: enrollment.student.name,
          classGroup: enrollment.classGroup.name,
          academicYear: enrollment.academicYear.name,
        },
        newValue: { status: "CANCELLED" },
      },
    }),
  ]);

  revalidatePath("/school/students");
  redirect("/school/students?success=enrollment-cancelled");
}

export async function archiveGuardian(formData: FormData) {
  const actor = await requireStudentManager();
  const guardianId = z.string().cuid().safeParse(formData.get("guardianId"));
  if (!guardianId.success) redirect("/school/students?error=invalid-request");

  const guardian = await prisma.guardian.findFirst({
    where: { id: guardianId.data, schoolId: actor.schoolId, deletedAt: null },
    include: { _count: { select: { students: true } } },
  });
  if (!guardian) redirect("/school/students?error=guardian-not-found");
  if (guardian._count.students > 0) redirect("/school/students?error=guardian-still-linked");

  await prisma.$transaction([
    prisma.guardian.update({ where: { id: guardian.id }, data: { deletedAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        schoolId: actor.schoolId,
        actorId: actor.actorId,
        action: "guardian.archived",
        entityType: "Guardian",
        entityId: guardian.id,
        oldValue: { name: guardian.name, phone: guardian.phone, email: guardian.email, deletedAt: null },
        newValue: { deletedAt: new Date().toISOString() },
      },
    }),
  ]);

  revalidatePath("/school/students");
  redirect("/school/students?success=guardian-archived");
}
