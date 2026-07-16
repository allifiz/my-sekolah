import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FlashMessage } from "@/components/flash-message";
import { prisma } from "@/lib/prisma";

import { AttendanceForm } from "./attendance-form";

const errorMessages: Record<string, string> = {
  forbidden: "Kamu tidak memiliki akses ke rombel tersebut.",
  "class-not-found": "Rombel tidak ditemukan.",
  "invalid-request": "Permintaan absensi tidak valid.",
  "no-students": "Rombel belum memiliki siswa aktif.",
  "reason-required": "Alasan wajib diisi untuk mengoreksi absensi yang sudah tersimpan.",
};

function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ classGroupId?: string; date?: string; error?: string; success?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");

  const params = await searchParams;
  const member = await prisma.schoolMember.findFirst({
    where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null },
    include: { roles: { include: { role: true } }, homeroomAssignments: { where: { isActive: true }, select: { classGroupId: true } } },
  });
  if (!member) redirect("/school?error=forbidden");

  const manager = member.roles.some(({ role }) => ["school-owner", "school-admin", "principal"].includes(role.key));
  const assignedIds = member.homeroomAssignments.map((item) => item.classGroupId);
  const classGroups = await prisma.classGroup.findMany({
    where: { schoolId: session.user.schoolId, isActive: true, ...(manager ? {} : { id: { in: assignedIds } }) },
    include: { academicYear: true, gradeLevel: true },
    orderBy: [{ academicYear: { startDate: "desc" } }, { gradeLevel: { order: "asc" } }, { name: "asc" }],
  });

  const selectedClassGroup = classGroups.find((item) => item.id === params.classGroupId) ?? classGroups[0];
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : todayJakarta();
  let attendanceRows: Array<{ studentId: string; nis: string; name: string; status: "PRESENT" | "SICK" | "EXCUSED" | "ABSENT" | "LATE"; note: string }> = [];
  let existingSession = null;

  if (selectedClassGroup) {
    const date = new Date(`${selectedDate}T00:00:00.000Z`);
    const [enrollments, foundSession] = await Promise.all([
      prisma.enrollment.findMany({
        where: { schoolId: session.user.schoolId, classGroupId: selectedClassGroup.id, status: "ACTIVE", student: { status: "ACTIVE", deletedAt: null } },
        select: { studentId: true, student: { select: { nis: true, name: true } } },
        orderBy: { student: { name: "asc" } },
      }),
      prisma.attendanceSession.findUnique({ where: { classGroupId_date: { classGroupId: selectedClassGroup.id, date } }, include: { records: true, submittedBy: { include: { user: true } } } }),
    ]);
    existingSession = foundSession;
    attendanceRows = enrollments.map((enrollment) => {
      const record = foundSession?.records.find((item) => item.studentId === enrollment.studentId);
      return { studentId: enrollment.studentId, nis: enrollment.student.nis, name: enrollment.student.name, status: record?.status ?? "PRESENT", note: record?.note ?? "" };
    });
  }

  const presentCount = attendanceRows.filter((row) => row.status === "PRESENT").length;
  const exceptionCount = attendanceRows.length - presentCount;

  return (
    <div className="admin-page">
      <header className="page-header"><div><span className="eyebrow">Operasional harian</span><h1>Absensi Rombel</h1><p>Catat kehadiran siswa per tanggal. Wali kelas hanya melihat rombel yang ditugaskan kepadanya.</p></div></header>
      {params.error ? <FlashMessage tone="error" title="Absensi gagal disimpan" message={errorMessages[params.error] ?? "Terjadi kesalahan."} /> : null}
      {params.success ? <FlashMessage tone="success" title="Absensi tersimpan" message="Kehadiran siswa sudah diperbarui dan siap dilihat pada rekap." /> : null}

      {classGroups.length === 0 ? <section className="panel empty-state"><strong>Tidak ada rombel yang dapat diakses</strong><p>Pastikan rombel aktif sudah dibuat dan penugasan wali kelas sudah tersedia.</p></section> : <>
        <section className="panel section-panel toolbar-panel">
          <form method="get" className="filter-toolbar">
            <label>Rombongan belajar<select name="classGroupId" defaultValue={selectedClassGroup?.id}>{classGroups.map((group) => <option key={group.id} value={group.id}>{group.academicYear.name} · {group.gradeLevel.name} · {group.name}</option>)}</select></label>
            <label>Tanggal<input type="date" name="date" defaultValue={selectedDate} required /></label>
            <button type="submit" className="secondary-button">Buka Daftar</button>
          </form>
        </section>

        {selectedClassGroup ? <>
          <section className="stats-grid">
            <article><span>Siswa terdaftar</span><strong>{attendanceRows.length}</strong></article>
            <article><span>Hadir</span><strong>{presentCount}</strong></article>
            <article><span>Perlu perhatian</span><strong>{exceptionCount}</strong></article>
            <article><span>Status sesi</span><strong>{existingSession ? "Tersimpan" : "Draft"}</strong></article>
          </section>
          <section className="panel section-panel">
            <div className="section-heading"><div><h2>{selectedClassGroup.gradeLevel.name} · {selectedClassGroup.name}</h2><p>{selectedClassGroup.academicYear.name} · {selectedDate}</p></div><span className={`status-badge ${existingSession ? "status-active" : "status-trial"}`}>{existingSession ? "TERSIMPAN" : "BELUM DISIMPAN"}</span></div>
            {existingSession ? <p>Terakhir disimpan oleh {existingSession.submittedBy.user.name ?? existingSession.submittedBy.user.email}.</p> : <p>Tandai siswa yang tidak hadir, lalu simpan absensi.</p>}
            {attendanceRows.length === 0 ? <div className="empty-state"><strong>Belum ada siswa aktif</strong><p>Masukkan siswa ke rombel ini sebelum mencatat absensi.</p></div> : <AttendanceForm classGroupId={selectedClassGroup.id} date={selectedDate} initialRows={attendanceRows} isCorrection={Boolean(existingSession)} />}
          </section>
        </> : null}
      </>}
    </div>
  );
}
