import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const statusLabels = {
  PRESENT: "Hadir",
  SICK: "Sakit",
  EXCUSED: "Izin",
  ABSENT: "Alpa",
  LATE: "Terlambat",
} as const;

function escapeCsv(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function nextMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1));
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) return NextResponse.redirect(new URL("/login", request.url));

  const classGroupId = request.nextUrl.searchParams.get("classGroupId") ?? "";
  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!/^[a-z0-9]+$/.test(classGroupId) || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }

  const member = await prisma.schoolMember.findFirst({
    where: {
      schoolId: session.user.schoolId,
      userId: session.user.id,
      status: "ACTIVE",
      deletedAt: null,
    },
    include: {
      roles: { include: { role: true } },
      homeroomAssignments: { where: { isActive: true }, select: { classGroupId: true } },
    },
  });
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const manager = member.roles.some(({ role }) => ["school-owner", "school-admin", "principal"].includes(role.key));
  const assignedIds = member.homeroomAssignments.map((item) => item.classGroupId);

  const classGroup = await prisma.classGroup.findFirst({
    where: {
      id: classGroupId,
      schoolId: session.user.schoolId,
      ...(manager ? {} : { id: { in: assignedIds } }),
    },
    include: { academicYear: true, gradeLevel: true },
  });
  if (!classGroup) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const from = new Date(`${month}-01T00:00:00.000Z`);
  const to = nextMonth(month);
  const records = await prisma.attendanceRecord.findMany({
    where: {
      schoolId: session.user.schoolId,
      session: {
        classGroupId: classGroup.id,
        date: { gte: from, lt: to },
      },
    },
    include: {
      student: { select: { nis: true, nisn: true, name: true } },
      session: { select: { date: true } },
    },
    orderBy: [
      { session: { date: "asc" } },
      { student: { name: "asc" } },
    ],
  });

  const header = ["tanggal", "tahun_ajaran", "jenjang", "rombel", "nis", "nisn", "nama", "status", "catatan"];
  const rows = records.map((record) => [
    record.session.date.toISOString().slice(0, 10),
    classGroup.academicYear.name,
    classGroup.gradeLevel.name,
    classGroup.name,
    record.student.nis,
    record.student.nisn ?? "",
    record.student.name,
    statusLabels[record.status],
    record.note ?? "",
  ]);

  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
  const filename = `absensi-${classGroup.name.replaceAll(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-${month}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
