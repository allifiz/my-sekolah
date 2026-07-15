"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const optionalText = z.preprocess((value) => {
  const text = String(value ?? "").trim();
  return text === "" ? undefined : text;
}, z.string().max(120).optional());

const updateStudentSchema = z.object({
  studentId: z.string().cuid(),
  nis: z.string().trim().min(1).max(30),
  nisn: optionalText,
  name: z.string().trim().min(2).max(120),
  gender: optionalText,
  birthPlace: optionalText,
  birthDate: z.preprocess((value) => {
    const text = String(value ?? "").trim();
    return text === "" ? undefined : new Date(`${text}T00:00:00.000Z`);
  }, z.date().optional()),
});

const statusSchema = z.object({
  studentId: z.string().cuid(),
  status: z.enum(["ACTIVE", "GRADUATED", "TRANSFERRED", "INACTIVE"]),
  reason: z.string().trim().min(3).max(300),
});

const enrollmentIdSchema = z.object({
  enrollmentId: z.string().cuid(),
  reason: z.string().trim().min(3).max(300),
});

const transferSchema = z.object({
  enrollmentId: z.string().cuid(),
  classGroupId: z.string().cuid(),
  reason: z.string().trim().min(3).max(300),
});

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

export async function updateStudent(formData: FormData) {
  const actor = await requireStudentManager();
  const parsed = updateStudentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/students?error=invalid-student-update");

  const current = await prisma.student.findFirst({
    where: { id: parsed.data.studentId, schoolId: actor.schoolId, deletedAt: null },
  });
  if (!current) redirect("/school/students?error=reference-not-found");

  const duplicate = await prisma.student.findFirst({
    where: {
      schoolId: actor.schoolId,
      id: { not: current.id },
      OR: [
        { nis: parsed.data.nis },
        ...(parsed.data.nisn ? [{ nisn: parsed.data.nisn }] : []),
      ],
    },
    select: { id: true },
  });
  if (duplicate) redirect("/school/students?error=duplicate-student");

  const updated = await prisma.student.update({
    where: { id: current.id },
    data: {
      nis: parsed.data.nis,
      nisn: parsed.data.nisn,
      name: parsed.data.name,
      gender: parsed.data.gender,
      birthPlace: parsed.data.birthPlace,
      birthDate: parsed.data.birthDate,
    },
  });

  await prisma.auditLog.create({
    data: {
      schoolId: actor.schoolId,
      actorId: actor.actorId,
      action: "student.updated",
      entityType: "Student",
      entityId: current.id,
      oldValue: { nis: current.nis, nisn: current.nisn, name: current.name, gender: current.gender, birthPlace: current.birthPlace, birthDate: current.birthDate },
      newValue: { nis: updated.nis, nisn: updated.nisn, name: updated.name, gender: updated.gender, birthPlace: updated.birthPlace, birthDate: updated.birthDate },
    },
  });

  revalidatePath("/school/students");
  redirect("/school/students?success=student-updated");
}

export async function changeStudentStatus(formData: FormData) {
  const actor = await requireStudentManager();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/students?error=invalid-status");

  const student = await prisma.student.findFirst({
    where: { id: parsed.data.studentId, schoolId: actor.schoolId, deletedAt: null },
  });
  if (!student) redirect("/school/students?error=reference-not-found");

  await prisma.$transaction(async (tx) => {
    await tx.student.update({ where: { id: student.id }, data: { status: parsed.data.status } });
    if (parsed.data.status !== "ACTIVE") {
      await tx.enrollment.updateMany({
        where: { schoolId: actor.schoolId, studentId: student.id, status: "ACTIVE" },
        data: { status: parsed.data.status === "TRANSFERRED" ? "TRANSFERRED" : "COMPLETED", endedAt: new Date() },
      });
    }
    await tx.auditLog.create({
      data: {
        schoolId: actor.schoolId,
        actorId: actor.actorId,
        action: "student.status_changed",
        entityType: "Student",
        entityId: student.id,
        reason: parsed.data.reason,
        oldValue: { status: student.status },
        newValue: { status: parsed.data.status },
      },
    });
  });

  revalidatePath("/school/students");
  redirect("/school/students?success=status-updated");
}

export async function endEnrollment(formData: FormData) {
  const actor = await requireStudentManager();
  const parsed = enrollmentIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/students?error=invalid-enrollment-action");

  const enrollment = await prisma.enrollment.findFirst({
    where: { id: parsed.data.enrollmentId, schoolId: actor.schoolId, status: "ACTIVE" },
    include: { student: true, classGroup: true, academicYear: true },
  });
  if (!enrollment) redirect("/school/students?error=enrollment-not-found");

  await prisma.$transaction([
    prisma.enrollment.update({ where: { id: enrollment.id }, data: { status: "COMPLETED", endedAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        schoolId: actor.schoolId,
        actorId: actor.actorId,
        action: "enrollment.completed",
        entityType: "Enrollment",
        entityId: enrollment.id,
        reason: parsed.data.reason,
        oldValue: { status: enrollment.status, classGroup: enrollment.classGroup.name },
        newValue: { status: "COMPLETED" },
      },
    }),
  ]);

  revalidatePath("/school/students");
  redirect("/school/students?success=enrollment-ended");
}

export async function transferEnrollment(formData: FormData) {
  const actor = await requireStudentManager();
  const parsed = transferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/students?error=invalid-transfer");

  const [enrollment, targetClass] = await Promise.all([
    prisma.enrollment.findFirst({
      where: { id: parsed.data.enrollmentId, schoolId: actor.schoolId, status: "ACTIVE" },
      include: { student: true, classGroup: true, academicYear: true },
    }),
    prisma.classGroup.findFirst({
      where: { id: parsed.data.classGroupId, schoolId: actor.schoolId, isActive: true },
      include: { academicYear: true },
    }),
  ]);
  if (!enrollment || !targetClass) redirect("/school/students?error=reference-not-found");
  if (enrollment.academicYearId !== targetClass.academicYearId) redirect("/school/students?error=transfer-year-mismatch");
  if (enrollment.classGroupId === targetClass.id) redirect("/school/students?error=transfer-same-class");

  const activeCount = await prisma.enrollment.count({ where: { classGroupId: targetClass.id, status: "ACTIVE" } });
  if (activeCount >= targetClass.capacity) redirect("/school/students?error=class-full");

  await prisma.$transaction([
    prisma.enrollment.update({ where: { id: enrollment.id }, data: { classGroupId: targetClass.id, startedAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        schoolId: actor.schoolId,
        actorId: actor.actorId,
        action: "enrollment.transferred",
        entityType: "Enrollment",
        entityId: enrollment.id,
        reason: parsed.data.reason,
        oldValue: { classGroupId: enrollment.classGroupId, classGroup: enrollment.classGroup.name },
        newValue: { classGroupId: targetClass.id, classGroup: targetClass.name },
        metadata: { academicYear: enrollment.academicYear.name },
      },
    }),
  ]);

  revalidatePath("/school/students");
  redirect("/school/students?success=student-transferred");
}
