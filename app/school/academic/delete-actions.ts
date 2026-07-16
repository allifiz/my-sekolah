"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAcademicManager() {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const member = await prisma.schoolMember.findFirst({ where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal"] } } } } }, select: { id: true } });
  if (!member) redirect("/school?error=forbidden");
  return { actorId: session.user.id, schoolId: session.user.schoolId };
}

function academicReturnPath(formData: FormData) {
  const value = formData.get("returnTo");
  return typeof value === "string" && value.startsWith("/school/academic") ? value : "/school/academic";
}

export async function deleteSemester(formData: FormData) {
  const actor = await requireAcademicManager();
  const returnTo = academicReturnPath(formData);
  const parsed = z.string().cuid().safeParse(formData.get("semesterId"));
  if (!parsed.success) redirect(`${returnTo}?error=invalid-request`);
  const semester = await prisma.semester.findFirst({ where: { id: parsed.data, schoolId: actor.schoolId } });
  if (!semester) redirect(`${returnTo}?error=not-found`);
  if (semester.isActive) redirect(`${returnTo}?error=active-period`);
  await prisma.$transaction([
    prisma.semester.delete({ where: { id: semester.id } }),
    prisma.auditLog.create({ data: { schoolId: actor.schoolId, actorId: actor.actorId, action: "semester.deleted", entityType: "Semester", entityId: semester.id, oldValue: { name: semester.name, type: semester.type, startDate: semester.startDate, endDate: semester.endDate } } }),
  ]);
  revalidatePath("/school");
  revalidatePath("/school/academic");
  revalidatePath(`/school/academic/${semester.academicYearId}`);
  redirect(`${returnTo}?success=semester-deleted`);
}

export async function deleteAcademicYear(formData: FormData) {
  const actor = await requireAcademicManager();
  const parsed = z.string().cuid().safeParse(formData.get("academicYearId"));
  if (!parsed.success) redirect("/school/academic?error=invalid-request");
  const year = await prisma.academicYear.findFirst({
    where: { id: parsed.data, schoolId: actor.schoolId },
    include: { _count: { select: { classGroups: true, enrollments: true } }, semesters: { select: { id: true, isActive: true } } },
  });
  if (!year) redirect("/school/academic?error=not-found");
  if (year._count.classGroups || year._count.enrollments) redirect("/school/academic?error=year-in-use");
  await prisma.$transaction([
    prisma.semester.deleteMany({ where: { academicYearId: year.id } }),
    prisma.academicYear.delete({ where: { id: year.id } }),
    prisma.auditLog.create({ data: { schoolId: actor.schoolId, actorId: actor.actorId, action: "academic_year.deleted", entityType: "AcademicYear", entityId: year.id, oldValue: { name: year.name, startDate: year.startDate, endDate: year.endDate, wasActive: year.isActive, semesterCount: year.semesters.length } } }),
  ]);
  revalidatePath("/school");
  revalidatePath("/school/academic");
  redirect("/school/academic?success=year-deleted");
}
