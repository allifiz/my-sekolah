"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const assignmentSchema = z.object({
  classGroupId: z.string().cuid(),
  schoolMemberId: z.string().cuid(),
});

async function requireAcademicManager() {
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

export async function assignHomeroomTeacher(formData: FormData) {
  const actor = await requireAcademicManager();
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/homerooms?error=invalid-assignment");

  const [classGroup, schoolMember] = await Promise.all([
    prisma.classGroup.findFirst({
      where: { id: parsed.data.classGroupId, schoolId: actor.schoolId, isActive: true },
      include: { academicYear: true, gradeLevel: true },
    }),
    prisma.schoolMember.findFirst({
      where: {
        id: parsed.data.schoolMemberId,
        schoolId: actor.schoolId,
        status: "ACTIVE",
        deletedAt: null,
      },
      include: { user: true },
    }),
  ]);

  if (!classGroup || !schoolMember) redirect("/school/homerooms?error=reference-not-found");

  const current = await prisma.homeroomAssignment.findFirst({
    where: { schoolId: actor.schoolId, classGroupId: classGroup.id, isActive: true },
    include: { schoolMember: { include: { user: true } } },
  });

  if (current?.schoolMemberId === schoolMember.id) {
    redirect("/school/homerooms?error=already-assigned");
  }

  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    await tx.homeroomAssignment.updateMany({
      where: { schoolId: actor.schoolId, classGroupId: classGroup.id, isActive: true },
      data: { isActive: false, endedAt: now },
    });

    return tx.homeroomAssignment.create({
      data: {
        schoolId: actor.schoolId,
        classGroupId: classGroup.id,
        schoolMemberId: schoolMember.id,
        startedAt: now,
      },
    });
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.actorId,
      schoolId: actor.schoolId,
      action: "homeroom_assignment.created",
      entityType: "HomeroomAssignment",
      entityId: created.id,
      oldValue: current
        ? { schoolMemberId: current.schoolMemberId, teacherName: current.schoolMember.user.name }
        : undefined,
      newValue: {
        schoolMemberId: schoolMember.id,
        teacherName: schoolMember.user.name,
        classGroupId: classGroup.id,
        className: classGroup.name,
        academicYear: classGroup.academicYear.name,
        gradeLevel: classGroup.gradeLevel.name,
      },
    },
  });

  revalidatePath("/school/homerooms");
  redirect("/school/homerooms?success=assigned");
}

export async function endHomeroomAssignment(formData: FormData) {
  const actor = await requireAcademicManager();
  const id = z.string().cuid().safeParse(formData.get("assignmentId"));
  if (!id.success) redirect("/school/homerooms?error=invalid-assignment");

  const assignment = await prisma.homeroomAssignment.findFirst({
    where: { id: id.data, schoolId: actor.schoolId, isActive: true },
    include: {
      classGroup: true,
      schoolMember: { include: { user: true } },
    },
  });
  if (!assignment) redirect("/school/homerooms?error=assignment-not-found");

  const endedAt = new Date();
  await prisma.homeroomAssignment.update({
    where: { id: assignment.id },
    data: { isActive: false, endedAt },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.actorId,
      schoolId: actor.schoolId,
      action: "homeroom_assignment.ended",
      entityType: "HomeroomAssignment",
      entityId: assignment.id,
      oldValue: { isActive: true, teacherName: assignment.schoolMember.user.name },
      newValue: { isActive: false, endedAt, className: assignment.classGroup.name },
    },
  });

  revalidatePath("/school/homerooms");
  redirect("/school/homerooms?success=ended");
}
