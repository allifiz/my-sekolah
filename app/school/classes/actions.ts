"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const gradeLevelSchema = z.object({
  code: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9-]+$/),
  name: z.string().trim().min(1).max(60),
  order: z.coerce.number().int().min(1).max(100),
});

const classGroupSchema = z.object({
  academicYearId: z.string().cuid(),
  gradeLevelId: z.string().cuid(),
  name: z.string().trim().min(1).max(80),
  capacity: z.coerce.number().int().min(1).max(200),
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

export async function createGradeLevel(formData: FormData) {
  const actor = await requireAcademicManager();
  const parsed = gradeLevelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/classes?error=invalid-grade");

  const code = parsed.data.code.toUpperCase();
  const duplicate = await prisma.gradeLevel.findFirst({
    where: {
      schoolId: actor.schoolId,
      OR: [{ code }, { name: parsed.data.name }],
    },
    select: { id: true },
  });
  if (duplicate) redirect("/school/classes?error=duplicate-grade");

  const created = await prisma.gradeLevel.create({
    data: { schoolId: actor.schoolId, code, name: parsed.data.name, order: parsed.data.order },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.actorId,
      schoolId: actor.schoolId,
      action: "grade_level.created",
      entityType: "GradeLevel",
      entityId: created.id,
      newValue: { code: created.code, name: created.name, order: created.order },
    },
  });

  revalidatePath("/school/classes");
  redirect("/school/classes?success=grade-created");
}

export async function createClassGroup(formData: FormData) {
  const actor = await requireAcademicManager();
  const parsed = classGroupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/classes?error=invalid-class");

  const [academicYear, gradeLevel] = await Promise.all([
    prisma.academicYear.findFirst({ where: { id: parsed.data.academicYearId, schoolId: actor.schoolId } }),
    prisma.gradeLevel.findFirst({ where: { id: parsed.data.gradeLevelId, schoolId: actor.schoolId, isActive: true } }),
  ]);
  if (!academicYear || !gradeLevel) redirect("/school/classes?error=reference-not-found");

  const duplicate = await prisma.classGroup.findUnique({
    where: { academicYearId_name: { academicYearId: academicYear.id, name: parsed.data.name } },
    select: { id: true },
  });
  if (duplicate) redirect("/school/classes?error=duplicate-class");

  const created = await prisma.classGroup.create({
    data: {
      schoolId: actor.schoolId,
      academicYearId: academicYear.id,
      gradeLevelId: gradeLevel.id,
      name: parsed.data.name,
      capacity: parsed.data.capacity,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.actorId,
      schoolId: actor.schoolId,
      action: "class_group.created",
      entityType: "ClassGroup",
      entityId: created.id,
      newValue: {
        name: created.name,
        capacity: created.capacity,
        academicYear: academicYear.name,
        gradeLevel: gradeLevel.name,
      },
    },
  });

  revalidatePath("/school/classes");
  redirect("/school/classes?success=class-created");
}

export async function toggleGradeLevel(formData: FormData) {
  const actor = await requireAcademicManager();
  const id = z.string().cuid().safeParse(formData.get("gradeLevelId"));
  if (!id.success) return;

  const gradeLevel = await prisma.gradeLevel.findFirst({ where: { id: id.data, schoolId: actor.schoolId } });
  if (!gradeLevel) return;

  const updated = await prisma.gradeLevel.update({ where: { id: gradeLevel.id }, data: { isActive: !gradeLevel.isActive } });
  await prisma.auditLog.create({
    data: {
      actorId: actor.actorId,
      schoolId: actor.schoolId,
      action: "grade_level.status_changed",
      entityType: "GradeLevel",
      entityId: gradeLevel.id,
      oldValue: { isActive: gradeLevel.isActive },
      newValue: { isActive: updated.isActive },
    },
  });
  revalidatePath("/school/classes");
}

export async function toggleClassGroup(formData: FormData) {
  const actor = await requireAcademicManager();
  const id = z.string().cuid().safeParse(formData.get("classGroupId"));
  if (!id.success) return;

  const classGroup = await prisma.classGroup.findFirst({ where: { id: id.data, schoolId: actor.schoolId } });
  if (!classGroup) return;

  const updated = await prisma.classGroup.update({ where: { id: classGroup.id }, data: { isActive: !classGroup.isActive } });
  await prisma.auditLog.create({
    data: {
      actorId: actor.actorId,
      schoolId: actor.schoolId,
      action: "class_group.status_changed",
      entityType: "ClassGroup",
      entityId: classGroup.id,
      oldValue: { isActive: classGroup.isActive },
      newValue: { isActive: updated.isActive },
    },
  });
  revalidatePath("/school/classes");
}