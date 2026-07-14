"use server";

import { SemesterType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const academicYearSchema = z.object({
  name: z.string().trim().min(4).max(30),
  startDate: dateString,
  endDate: dateString,
  isActive: z.string().optional(),
});

const semesterSchema = z.object({
  academicYearId: z.string().cuid(),
  type: z.nativeEnum(SemesterType),
  startDate: dateString,
  endDate: dateString,
  isActive: z.string().optional(),
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

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function createAcademicYear(formData: FormData) {
  const actor = await requireAcademicManager();
  const parsed = academicYearSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/academic?error=invalid-year");

  const startDate = toDate(parsed.data.startDate);
  const endDate = toDate(parsed.data.endDate);
  if (endDate <= startDate) redirect("/school/academic?error=invalid-year-range");

  const duplicate = await prisma.academicYear.findUnique({
    where: { schoolId_name: { schoolId: actor.schoolId, name: parsed.data.name } },
    select: { id: true },
  });
  if (duplicate) redirect("/school/academic?error=duplicate-year");

  const isActive = parsed.data.isActive === "on";
  await prisma.$transaction(async (tx) => {
    if (isActive) {
      await tx.academicYear.updateMany({ where: { schoolId: actor.schoolId, isActive: true }, data: { isActive: false } });
      await tx.semester.updateMany({ where: { schoolId: actor.schoolId, isActive: true }, data: { isActive: false } });
    }

    const created = await tx.academicYear.create({
      data: { schoolId: actor.schoolId, name: parsed.data.name, startDate, endDate, isActive },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.actorId,
        schoolId: actor.schoolId,
        action: "academic_year.created",
        entityType: "AcademicYear",
        entityId: created.id,
        newValue: { name: created.name, startDate, endDate, isActive },
      },
    });
  });

  revalidatePath("/school");
  revalidatePath("/school/academic");
  redirect("/school/academic?success=year-created");
}

export async function activateAcademicYear(formData: FormData) {
  const actor = await requireAcademicManager();
  const academicYearId = z.string().cuid().safeParse(formData.get("academicYearId"));
  if (!academicYearId.success) return;

  const year = await prisma.academicYear.findFirst({ where: { id: academicYearId.data, schoolId: actor.schoolId } });
  if (!year) return;

  await prisma.$transaction([
    prisma.academicYear.updateMany({ where: { schoolId: actor.schoolId, isActive: true }, data: { isActive: false } }),
    prisma.semester.updateMany({ where: { schoolId: actor.schoolId, isActive: true }, data: { isActive: false } }),
    prisma.academicYear.update({ where: { id: year.id }, data: { isActive: true } }),
    prisma.auditLog.create({
      data: {
        actorId: actor.actorId,
        schoolId: actor.schoolId,
        action: "academic_year.activated",
        entityType: "AcademicYear",
        entityId: year.id,
        newValue: { name: year.name, isActive: true },
      },
    }),
  ]);

  revalidatePath("/school");
  revalidatePath("/school/academic");
}

export async function createSemester(formData: FormData) {
  const actor = await requireAcademicManager();
  const parsed = semesterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/academic?error=invalid-semester");

  const academicYear = await prisma.academicYear.findFirst({
    where: { id: parsed.data.academicYearId, schoolId: actor.schoolId },
  });
  if (!academicYear) redirect("/school/academic?error=year-not-found");

  const startDate = toDate(parsed.data.startDate);
  const endDate = toDate(parsed.data.endDate);
  if (endDate <= startDate || startDate < academicYear.startDate || endDate > academicYear.endDate) {
    redirect("/school/academic?error=invalid-semester-range");
  }

  const duplicate = await prisma.semester.findUnique({
    where: { academicYearId_type: { academicYearId: academicYear.id, type: parsed.data.type } },
    select: { id: true },
  });
  if (duplicate) redirect("/school/academic?error=duplicate-semester");

  const isActive = parsed.data.isActive === "on";
  const name = parsed.data.type === SemesterType.ODD ? "Ganjil" : "Genap";

  await prisma.$transaction(async (tx) => {
    if (isActive) {
      await tx.academicYear.updateMany({ where: { schoolId: actor.schoolId, isActive: true }, data: { isActive: false } });
      await tx.academicYear.update({ where: { id: academicYear.id }, data: { isActive: true } });
      await tx.semester.updateMany({ where: { schoolId: actor.schoolId, isActive: true }, data: { isActive: false } });
    }

    const created = await tx.semester.create({
      data: {
        schoolId: actor.schoolId,
        academicYearId: academicYear.id,
        type: parsed.data.type,
        name,
        startDate,
        endDate,
        isActive,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.actorId,
        schoolId: actor.schoolId,
        action: "semester.created",
        entityType: "Semester",
        entityId: created.id,
        newValue: { academicYear: academicYear.name, type: created.type, startDate, endDate, isActive },
      },
    });
  });

  revalidatePath("/school");
  revalidatePath("/school/academic");
  redirect("/school/academic?success=semester-created");
}

export async function activateSemester(formData: FormData) {
  const actor = await requireAcademicManager();
  const semesterId = z.string().cuid().safeParse(formData.get("semesterId"));
  if (!semesterId.success) return;

  const semester = await prisma.semester.findFirst({
    where: { id: semesterId.data, schoolId: actor.schoolId },
    include: { academicYear: true },
  });
  if (!semester) return;

  await prisma.$transaction([
    prisma.academicYear.updateMany({ where: { schoolId: actor.schoolId, isActive: true }, data: { isActive: false } }),
    prisma.academicYear.update({ where: { id: semester.academicYearId }, data: { isActive: true } }),
    prisma.semester.updateMany({ where: { schoolId: actor.schoolId, isActive: true }, data: { isActive: false } }),
    prisma.semester.update({ where: { id: semester.id }, data: { isActive: true } }),
    prisma.auditLog.create({
      data: {
        actorId: actor.actorId,
        schoolId: actor.schoolId,
        action: "semester.activated",
        entityType: "Semester",
        entityId: semester.id,
        newValue: { academicYear: semester.academicYear.name, type: semester.type, isActive: true },
      },
    }),
  ]);

  revalidatePath("/school");
  revalidatePath("/school/academic");
}