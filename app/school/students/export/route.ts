import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const students = await prisma.student.findMany({
    where: { schoolId: session.user.schoolId, deletedAt: null },
    include: {
      guardians: { include: { guardian: true }, orderBy: { isPrimary: "desc" } },
      enrollments: {
        where: { status: "ACTIVE" },
        include: { academicYear: true, classGroup: { include: { gradeLevel: true } } },
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  const header = [
    "nis", "nisn", "name", "gender", "birth_place", "birth_date", "status",
    "academic_year", "grade_level", "class_group", "primary_guardian", "guardian_phone", "all_guardians",
  ];
  const rows = students.map((student) => {
    const enrollment = student.enrollments[0];
    const primary = student.guardians.find((item) => item.isPrimary) ?? student.guardians[0];
    return [
      student.nis,
      student.nisn,
      student.name,
      student.gender,
      student.birthPlace,
      formatDate(student.birthDate),
      student.status,
      enrollment?.academicYear.name,
      enrollment?.classGroup.gradeLevel.name,
      enrollment?.classGroup.name,
      primary?.guardian.name,
      primary?.guardian.phone,
      student.guardians.map((item) => `${item.guardian.name} (${item.relationship}${item.isPrimary ? ", utama" : ""})`).join("; "),
    ];
  });

  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="export-siswa-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
