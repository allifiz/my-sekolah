"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const attendanceStatuses = ["PRESENT", "SICK", "EXCUSED", "ABSENT", "LATE"] as const;

const attendanceSchema = z.object({
  classGroupId: z.string().cuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  correctionReason: z.string().trim().max(500).optional(),
});

async function requireAttendanceAccess(classGroupId: string) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");

  const member = await prisma.schoolMember.findFirst({
    where: {
      schoolId: session.user.schoolId,
      userId: session.user.id,
      status: "ACTIVE",
      deletedAt: null,
    },
    include: {
      roles: { include: { role: true } },
      homeroomAssignments: {
        where: { classGroupId, isActive: true },
        select: { id: true },
      },
    },
  });

  if (!member) redirect("/school?error=forbidden");
  const manager = member.roles.some(({ role }) => ["school-owner", "school-admin", "principal"].includes(role.key));
  if (!manager && member.homeroomAssignments.length === 0) redirect("/school/attendance?error=forbidden");

  const classGroup = await prisma.classGroup.findFirst({
    where: { id: classGroupId, schoolId: session.user.schoolId, isActive: true },
    include: { academicYear: true, gradeLevel: true },
  });
  if (!classGroup) redirect("/school/attendance?error=class-not-found");

  return {
    actorId: session.user.id,
    memberId: member.id,
    schoolId: session.user.schoolId,
    classGroup,
  };
}

export async function saveAttendance(formData: FormData) {
  const parsed = attendanceSchema.safeParse({
    classGroupId: formData.get("classGroupId"),
    date: formData.get("date"),
    correctionReason: String(formData.get("correctionReason") ?? "").trim() || undefined,
  });
  if (!parsed.success) redirect("/school/attendance?error=invalid-request");

  const access = await requireAttendanceAccess(parsed.data.classGroupId);
  const date = new Date(`${parsed.data.date}T00:00:00.000Z`);

  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolId: access.schoolId,
      classGroupId: access.classGroup.id,
      status: "ACTIVE",
      student: { status: "ACTIVE", deletedAt: null },
    },
    select: { studentId: true, student: { select: { name: true, nis: true } } },
    orderBy: { student: { name: "asc" } },
  });
  if (enrollments.length === 0) redirect(`/school/attendance?classGroupId=${access.classGroup.id}&date=${parsed.data.date}&error=no-students`);

  const existingSession = await prisma.attendanceSession.findUnique({
    where: { classGroupId_date: { classGroupId: access.classGroup.id, date } },
    include: { records: true },
  });

  const submitted = enrollments.map(({ studentId, student }) => {
    const raw = String(formData.get(`status:${studentId}`) ?? "PRESENT");
    const status = attendanceStatuses.includes(raw as (typeof attendanceStatuses)[number])
      ? (raw as (typeof attendanceStatuses)[number])
      : "PRESENT";
    const note = String(formData.get(`note:${studentId}`) ?? "").trim().slice(0, 300) || null;
    return { studentId, student, status, note };
  });

  const changed = existingSession
    ? submitted.filter((item) => {
        const old = existingSession.records.find((record) => record.studentId === item.studentId);
        return !old || old.status !== item.status || (old.note ?? null) !== item.note;
      })
    : submitted;

  if (existingSession && changed.length > 0 && !parsed.data.correctionReason) {
    redirect(`/school/attendance?classGroupId=${access.classGroup.id}&date=${parsed.data.date}&error=reason-required`);
  }

  const saved = await prisma.$transaction(async (tx) => {
    const session = existingSession
      ? await tx.attendanceSession.update({
          where: { id: existingSession.id },
          data: { submittedById: access.memberId, submittedAt: new Date() },
        })
      : await tx.attendanceSession.create({
          data: {
            schoolId: access.schoolId,
            classGroupId: access.classGroup.id,
            date,
            submittedById: access.memberId,
          },
        });

    for (const item of submitted) {
      await tx.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId: session.id, studentId: item.studentId } },
        update: { status: item.status, note: item.note, recordedById: access.memberId },
        create: {
          schoolId: access.schoolId,
          sessionId: session.id,
          studentId: item.studentId,
          status: item.status,
          note: item.note,
          recordedById: access.memberId,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        schoolId: access.schoolId,
        actorId: access.actorId,
        action: existingSession ? "attendance.corrected" : "attendance.submitted",
        entityType: "AttendanceSession",
        entityId: session.id,
        reason: parsed.data.correctionReason,
        oldValue: existingSession
          ? existingSession.records.map((record) => ({ studentId: record.studentId, status: record.status, note: record.note }))
          : undefined,
        newValue: submitted.map((item) => ({ studentId: item.studentId, status: item.status, note: item.note })),
        metadata: {
          classGroupId: access.classGroup.id,
          classGroup: access.classGroup.name,
          academicYear: access.classGroup.academicYear.name,
          date: parsed.data.date,
          changedStudents: changed.map((item) => ({ studentId: item.studentId, name: item.student.name, nis: item.student.nis })),
        },
      },
    });

    return session;
  });

  revalidatePath("/school/attendance");
  redirect(`/school/attendance?classGroupId=${access.classGroup.id}&date=${parsed.data.date}&success=saved&sessionId=${saved.id}`);
}
