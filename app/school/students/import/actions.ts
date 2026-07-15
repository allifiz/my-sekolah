"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const importRowSchema = z.object({
  rowNumber: z.number().int().min(2),
  nis: z.string().trim().min(1).max(30),
  nisn: z.string().trim().max(30).optional().default(""),
  name: z.string().trim().min(2).max(120),
  gender: z.enum(["", "L", "P"]).default(""),
  birthPlace: z.string().trim().max(120).optional().default(""),
  birthDate: z.string().trim().optional().default(""),
});

const importPayloadSchema = z.array(importRowSchema).min(1).max(1000);

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
          role: { key: { in: ["school-owner", "school-admin", "principal"] } },
        },
      },
    },
    select: { id: true },
  });

  if (!member) redirect("/school?error=forbidden");
  return { actorId: session.user.id, schoolId: session.user.schoolId };
}

function parseBirthDate(value: string) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function importStudents(formData: FormData) {
  const actor = await requireStudentManager();
  const rawPayload = String(formData.get("payload") ?? "");

  let json: unknown;
  try {
    json = JSON.parse(rawPayload);
  } catch {
    redirect("/school/students/import?error=invalid-payload");
  }

  const parsed = importPayloadSchema.safeParse(json);
  if (!parsed.success) redirect("/school/students/import?error=invalid-rows");

  const normalized = parsed.data.map((row) => ({
    ...row,
    nis: row.nis.trim(),
    nisn: row.nisn.trim() || undefined,
    name: row.name.trim(),
    gender: row.gender || undefined,
    birthPlace: row.birthPlace.trim() || undefined,
    birthDate: parseBirthDate(row.birthDate),
  }));

  if (normalized.some((row) => row.birthDate === null)) {
    redirect("/school/students/import?error=invalid-date");
  }

  const duplicateNis = normalized.find((row, index) => normalized.findIndex((item) => item.nis === row.nis) !== index);
  const duplicateNisn = normalized.find(
    (row, index) => row.nisn && normalized.findIndex((item) => item.nisn === row.nisn) !== index,
  );
  if (duplicateNis || duplicateNisn) redirect("/school/students/import?error=duplicate-file");

  const [school, currentCount, existing] = await Promise.all([
    prisma.school.findUnique({ where: { id: actor.schoolId }, select: { studentLimit: true } }),
    prisma.student.count({ where: { schoolId: actor.schoolId, deletedAt: null } }),
    prisma.student.findMany({
      where: {
        schoolId: actor.schoolId,
        OR: [
          { nis: { in: normalized.map((row) => row.nis) } },
          { nisn: { in: normalized.flatMap((row) => (row.nisn ? [row.nisn] : [])) } },
        ],
      },
      select: { nis: true, nisn: true },
    }),
  ]);

  if (!school) redirect("/login");
  if (currentCount + normalized.length > school.studentLimit) {
    redirect("/school/students/import?error=student-limit");
  }
  if (existing.length > 0) redirect("/school/students/import?error=duplicate-database");

  await prisma.$transaction(async (tx) => {
    const created = await Promise.all(
      normalized.map((row) =>
        tx.student.create({
          data: {
            schoolId: actor.schoolId,
            nis: row.nis,
            nisn: row.nisn,
            name: row.name,
            gender: row.gender,
            birthPlace: row.birthPlace,
            birthDate: row.birthDate ?? undefined,
          },
          select: { id: true, nis: true, nisn: true, name: true },
        }),
      ),
    );

    await tx.auditLog.create({
      data: {
        schoolId: actor.schoolId,
        actorId: actor.actorId,
        action: "student.imported",
        entityType: "StudentImport",
        metadata: {
          count: created.length,
          rows: created.map((student) => ({ id: student.id, nis: student.nis, nisn: student.nisn, name: student.name })),
        },
      },
    });
  });

  revalidatePath("/school/students");
  revalidatePath("/school/students/import");
  redirect(`/school/students/import?success=imported&count=${normalized.length}`);
}
