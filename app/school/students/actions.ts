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

const studentSchema = z.object({
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

const guardianSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: optionalText,
  email: z.preprocess((value) => {
    const text = String(value ?? "").trim().toLowerCase();
    return text === "" ? undefined : text;
  }, z.string().email().max(160).optional()),
  address: z.preprocess((value) => {
    const text = String(value ?? "").trim();
    return text === "" ? undefined : text;
  }, z.string().max(500).optional()),
});

const linkSchema = z.object({
  studentId: z.string().cuid(),
  guardianId: z.string().cuid(),
  relationship: z.string().trim().min(2).max(40),
  isPrimary: z.preprocess((value) => value === "on", z.boolean()),
});

const enrollmentSchema = z.object({
  studentId: z.string().cuid(),
  classGroupId: z.string().cuid(),
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
      roles: {
        some: {
          role: {
            key: { in: ["school-owner", "school-admin", "principal"] },
          },
        },
      },
    },
    select: { id: true },
  });

  if (!member) redirect("/school?error=forbidden");
  return { actorId: session.user.id, schoolId: session.user.schoolId };
}

export async function createStudent(formData: FormData) {
  const actor = await requireStudentManager();
  const parsed = studentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/students?error=invalid-student");

  const [school, totalStudents, duplicate] = await Promise.all([
    prisma.school.findUnique({ where: { id: actor.schoolId }, select: { studentLimit: true } }),
    prisma.student.count({ where: { schoolId: actor.schoolId, deletedAt: null } }),
    prisma.student.findFirst({
      where: {
        schoolId: actor.schoolId,
        OR: [
          { nis: parsed.data.nis },
          ...(parsed.data.nisn ? [{ nisn: parsed.data.nisn }] : []),
        ],
      },
      select: { id: true },
    }),
  ]);

  if (!school) redirect("/login");
  if (totalStudents >= school.studentLimit) redirect("/school/students?error=student-limit");
  if (duplicate) redirect("/school/students?error=duplicate-student");

  const student = await prisma.student.create({
    data: {
      schoolId: actor.schoolId,
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
      action: "student.created",
      entityType: "Student",
      entityId: student.id,
      newValue: { nis: student.nis, nisn: student.nisn, name: student.name },
    },
  });

  revalidatePath("/school/students");
  redirect("/school/students?success=student-created");
}

export async function createGuardian(formData: FormData) {
  const actor = await requireStudentManager();
  const parsed = guardianSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/students?error=invalid-guardian");

  const guardian = await prisma.guardian.create({
    data: { schoolId: actor.schoolId, ...parsed.data },
  });

  await prisma.auditLog.create({
    data: {
      schoolId: actor.schoolId,
      actorId: actor.actorId,
      action: "guardian.created",
      entityType: "Guardian",
      entityId: guardian.id,
      newValue: { name: guardian.name, phone: guardian.phone, email: guardian.email },
    },
  });

  revalidatePath("/school/students");
  redirect("/school/students?success=guardian-created");
}

export async function linkStudentGuardian(formData: FormData) {
  const actor = await requireStudentManager();
  const parsed = linkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/students?error=invalid-link");

  const [student, guardian] = await Promise.all([
    prisma.student.findFirst({ where: { id: parsed.data.studentId, schoolId: actor.schoolId, deletedAt: null } }),
    prisma.guardian.findFirst({ where: { id: parsed.data.guardianId, schoolId: actor.schoolId, deletedAt: null } }),
  ]);
  if (!student || !guardian) redirect("/school/students?error=reference-not-found");

  const duplicate = await prisma.studentGuardian.findUnique({
    where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
    select: { id: true },
  });
  if (duplicate) redirect("/school/students?error=duplicate-link");

  const relation = await prisma.$transaction(async (tx) => {
    if (parsed.data.isPrimary) {
      await tx.studentGuardian.updateMany({
        where: { schoolId: actor.schoolId, studentId: student.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.studentGuardian.create({
      data: {
        schoolId: actor.schoolId,
        studentId: student.id,
        guardianId: guardian.id,
        relationship: parsed.data.relationship,
        isPrimary: parsed.data.isPrimary,
      },
    });
  });

  await prisma.auditLog.create({
    data: {
      schoolId: actor.schoolId,
      actorId: actor.actorId,
      action: "student_guardian.linked",
      entityType: "StudentGuardian",
      entityId: relation.id,
      newValue: {
        student: student.name,
        guardian: guardian.name,
        relationship: relation.relationship,
        isPrimary: relation.isPrimary,
      },
    },
  });

  revalidatePath("/school/students");
  redirect("/school/students?success=guardian-linked");
}

export async function enrollStudent(formData: FormData) {
  const actor = await requireStudentManager();
  const parsed = enrollmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/students?error=invalid-enrollment");

  const [student, classGroup] = await Promise.all([
    prisma.student.findFirst({ where: { id: parsed.data.studentId, schoolId: actor.schoolId, deletedAt: null, status: "ACTIVE" } }),
    prisma.classGroup.findFirst({ where: { id: parsed.data.classGroupId, schoolId: actor.schoolId, isActive: true }, include: { academicYear: true } }),
  ]);
  if (!student || !classGroup) redirect("/school/students?error=reference-not-found");

  const duplicate = await prisma.enrollment.findUnique({
    where: { studentId_academicYearId: { studentId: student.id, academicYearId: classGroup.academicYearId } },
    select: { id: true },
  });
  if (duplicate) redirect("/school/students?error=duplicate-enrollment");

  const activeCount = await prisma.enrollment.count({
    where: { classGroupId: classGroup.id, status: "ACTIVE" },
  });
  if (activeCount >= classGroup.capacity) redirect("/school/students?error=class-full");

  const enrollment = await prisma.enrollment.create({
    data: {
      schoolId: actor.schoolId,
      studentId: student.id,
      academicYearId: classGroup.academicYearId,
      classGroupId: classGroup.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      schoolId: actor.schoolId,
      actorId: actor.actorId,
      action: "enrollment.created",
      entityType: "Enrollment",
      entityId: enrollment.id,
      newValue: {
        student: student.name,
        academicYear: classGroup.academicYear.name,
        classGroup: classGroup.name,
      },
    },
  });

  revalidatePath("/school/students");
  redirect("/school/students?success=enrolled");
}
