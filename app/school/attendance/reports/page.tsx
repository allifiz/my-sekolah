import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const statusLabels = {
  PRESENT: "Hadir",
  SICK: "Sakit",
  EXCUSED: "Izin",
  ABSENT: "Alpa",
  LATE: "Terlambat",
} as const;

type AttendanceStatus = keyof typeof statusLabels;

function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function monthStart(value: string) {
  return new Date(`${value}-01T00:00:00.000Z`);
}

function nextMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1));
}

export default async function AttendanceReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ classGroupId?: string; month?: string; studentId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");

  const params = await searchParams;
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
  if (!member) redirect("/school?error=forbidden");

  const manager = member.roles.some(({ role }) => ["school-owner", "school-admin", "principal"].includes(role.key));
  const assignedIds = member.homeroomAssignments.map((item) => item.classGroupId);

  const classGroups = await prisma.classGroup.findMany({
    where: {
      schoolId: session.user.schoolId,
      isActive: true,
      ...(manager ? {} : { id: { in: assignedIds } }),
    },
    include: { academicYear: true, gradeLevel: true },
    orderBy: [
      { academicYear: { startDate: "desc" } },
      { gradeLevel: { order: "asc" } },
      { name: "asc" },
    ],
  });

  const selectedClass = classGroups.find((item) => item.id === params.classGroupId) ?? classGroups[0];
  const currentMonth = todayJakarta().slice(0, 7);
  const selectedMonth = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : currentMonth;
  const from = monthStart(selectedMonth);
  const to = nextMonth(selectedMonth);

  const sessions = selectedClass
    ? await prisma.attendanceSession.findMany({
        where: {
          schoolId: session.user.schoolId,
          classGroupId: selectedClass.id,
          date: { gte: from, lt: to },
        },
        include: {
          records: { include: { student: { select: { id: true, nis: true, name: true } } } },
        },
        orderBy: { date: "asc" },
      })
    : [];

  const students = selectedClass
    ? await prisma.enrollment.findMany({
        where: {
          schoolId: session.user.schoolId,
          classGroupId: selectedClass.id,
          student: { deletedAt: null },
        },
        select: { student: { select: { id: true, nis: true, name: true } } },
        orderBy: { student: { name: "asc" } },
      })
    : [];

  const selectedStudentId = students.some((item) => item.student.id === params.studentId)
    ? params.studentId
    : undefined;

  const totals: Record<AttendanceStatus, number> = {
    PRESENT: 0,
    SICK: 0,
    EXCUSED: 0,
    ABSENT: 0,
    LATE: 0,
  };

  for (const sessionItem of sessions) {
    for (const record of sessionItem.records) totals[record.status] += 1;
  }

  const studentRows = students.map(({ student }) => {
    const counts = { PRESENT: 0, SICK: 0, EXCUSED: 0, ABSENT: 0, LATE: 0 } as Record<AttendanceStatus, number>;
    for (const sessionItem of sessions) {
      const record = sessionItem.records.find((item) => item.studentId === student.id);
      if (record) counts[record.status] += 1;
    }
    return { student, counts };
  });

  const selectedStudentHistory = selectedStudentId
    ? sessions.flatMap((sessionItem) => {
        const record = sessionItem.records.find((item) => item.studentId === selectedStudentId);
        return record ? [{ date: sessionItem.date, status: record.status, note: record.note }] : [];
      })
    : [];

  const totalRecords = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const presentRate = totalRecords === 0 ? 0 : Math.round(((totals.PRESENT + totals.LATE) / totalRecords) * 100);

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Analitik operasional</span>
          <h1>Rekap Absensi</h1>
          <p>Rekap bulanan, statistik status, riwayat per siswa, dan export CSV.</p>
        </div>
        <Link href="/school/attendance" className="secondary-button">Input Absensi</Link>
      </header>

      <section className="panel section-panel">
        <form method="get" className="admin-form">
          <label>Rombongan belajar
            <select name="classGroupId" defaultValue={selectedClass?.id}>
              {classGroups.map((group) => (
                <option key={group.id} value={group.id}>{group.academicYear.name} · {group.gradeLevel.name} · {group.name}</option>
              ))}
            </select>
          </label>
          <label>Bulan<input type="month" name="month" defaultValue={selectedMonth} required /></label>
          <label>Siswa
            <select name="studentId" defaultValue={selectedStudentId ?? ""}>
              <option value="">Semua siswa</option>
              {students.map(({ student }) => <option key={student.id} value={student.id}>{student.name} · {student.nis}</option>)}
            </select>
          </label>
          <button type="submit" className="secondary-button">Tampilkan</button>
        </form>
      </section>

      <section className="stats-grid">
        <article><span>Hari tercatat</span><strong>{sessions.length}</strong></article>
        <article><span>Tingkat hadir</span><strong>{presentRate}%</strong></article>
        <article><span>Alpa</span><strong>{totals.ABSENT}</strong></article>
        <article><span>Terlambat</span><strong>{totals.LATE}</strong></article>
      </section>

      <section className="panel section-panel">
        <div className="page-header">
          <div>
            <h2>Ringkasan Status</h2>
            <p>{selectedClass ? `${selectedClass.gradeLevel.name} · ${selectedClass.name} · ${selectedMonth}` : "Belum ada rombel yang dapat diakses."}</p>
          </div>
          {selectedClass ? (
            <a className="secondary-button" href={`/school/attendance/reports/export?classGroupId=${selectedClass.id}&month=${selectedMonth}`}>Export CSV</a>
          ) : null}
        </div>
        <div className="stats-grid">
          {(Object.keys(statusLabels) as AttendanceStatus[]).map((status) => (
            <article key={status}><span>{statusLabels[status]}</span><strong>{totals[status]}</strong></article>
          ))}
        </div>
      </section>

      <section className="panel section-panel">
        <h2>Rekap per Siswa</h2>
        {studentRows.length === 0 ? <p>Belum ada siswa pada rombel ini.</p> : (
          <div className="stats-grid">
            {studentRows.map(({ student, counts }) => (
              <article key={student.id}>
                <span>{student.nis}</span>
                <strong>{student.name}</strong>
                <p>H {counts.PRESENT} · S {counts.SICK} · I {counts.EXCUSED} · A {counts.ABSENT} · T {counts.LATE}</p>
                <Link href={`/school/attendance/reports?classGroupId=${selectedClass?.id}&month=${selectedMonth}&studentId=${student.id}`}>Lihat riwayat</Link>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedStudentId ? (
        <section className="panel section-panel">
          <h2>Riwayat Siswa</h2>
          {selectedStudentHistory.length === 0 ? <p>Belum ada absensi pada bulan ini.</p> : (
            <div className="stats-grid">
              {selectedStudentHistory.map((item) => (
                <article key={item.date.toISOString()}>
                  <span>{item.date.toISOString().slice(0, 10)}</span>
                  <strong>{statusLabels[item.status]}</strong>
                  <p>{item.note ?? "Tanpa catatan"}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="panel section-panel">
        <h2>Rekap Harian</h2>
        {sessions.length === 0 ? <p>Belum ada sesi absensi pada bulan ini.</p> : (
          <div className="stats-grid">
            {sessions.map((sessionItem) => {
              const counts = { PRESENT: 0, SICK: 0, EXCUSED: 0, ABSENT: 0, LATE: 0 } as Record<AttendanceStatus, number>;
              for (const record of sessionItem.records) counts[record.status] += 1;
              return (
                <article key={sessionItem.id}>
                  <span>{sessionItem.date.toISOString().slice(0, 10)}</span>
                  <strong>{sessionItem.records.length} siswa</strong>
                  <p>H {counts.PRESENT} · S {counts.SICK} · I {counts.EXCUSED} · A {counts.ABSENT} · T {counts.LATE}</p>
                  <Link href={`/school/attendance?classGroupId=${selectedClass?.id}&date=${sessionItem.date.toISOString().slice(0, 10)}`}>Buka absensi</Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
