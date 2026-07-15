import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { changeStudentStatus, endEnrollment, transferEnrollment, updateStudent } from "../lifecycle-actions";

const errorMessages: Record<string, string> = {
  "invalid-student-update": "Perubahan data siswa belum valid.",
  "duplicate-student": "NIS atau NISN sudah digunakan siswa lain.",
  "invalid-status": "Perubahan status siswa belum valid.",
  "invalid-enrollment-action": "Permintaan mengakhiri enrollment belum valid.",
  "enrollment-not-found": "Enrollment aktif tidak ditemukan.",
  "invalid-transfer": "Data perpindahan kelas belum valid.",
  "transfer-year-mismatch": "Perpindahan hanya dapat dilakukan dalam tahun ajaran yang sama.",
  "transfer-same-class": "Rombel tujuan sama dengan rombel saat ini.",
  "class-full": "Kapasitas rombel tujuan sudah penuh.",
  "reference-not-found": "Siswa, enrollment, atau rombel tidak ditemukan.",
};

function dateValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export default async function StudentLifecyclePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");

  const schoolId = session.user.schoolId;
  const [students, classGroups, params] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId, deletedAt: null },
      include: {
        enrollments: {
          where: { status: "ACTIVE" },
          include: { academicYear: true, classGroup: { include: { gradeLevel: true } } },
          orderBy: { startedAt: "desc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.classGroup.findMany({
      where: { schoolId, isActive: true },
      include: {
        academicYear: true,
        gradeLevel: true,
        _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
      },
      orderBy: [
        { academicYear: { startDate: "desc" } },
        { gradeLevel: { order: "asc" } },
        { name: "asc" },
      ],
    }),
    searchParams,
  ]);

  const activeEnrollments = students.flatMap((student) =>
    student.enrollments.map((enrollment) => ({ student, enrollment })),
  );

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Siklus data siswa</span>
          <h1>Edit, Status, dan Perpindahan Kelas</h1>
          <p>Perbarui identitas siswa dan kelola perubahan enrollment dengan alasan serta audit trail.</p>
        </div>
        <Link href="/school/students" className="secondary-button">Kembali ke Siswa & Wali</Link>
      </header>

      {params.error ? (
        <section className="panel section-panel"><strong>Gagal:</strong> {errorMessages[params.error] ?? "Terjadi kesalahan."}</section>
      ) : null}
      {params.success ? (
        <section className="panel section-panel"><strong>Berhasil:</strong> Siklus data siswa sudah diperbarui.</section>
      ) : null}

      <section className="stats-grid">
        <article><span>Total siswa</span><strong>{students.length}</strong></article>
        <article><span>Siswa aktif</span><strong>{students.filter((student) => student.status === "ACTIVE").length}</strong></article>
        <article><span>Enrollment aktif</span><strong>{activeEnrollments.length}</strong></article>
        <article><span>Rombel tersedia</span><strong>{classGroups.length}</strong></article>
      </section>

      <section className="panel section-panel">
        <h2>Edit Data Siswa</h2>
        {students.length === 0 ? <p>Belum ada siswa.</p> : students.map((student) => (
          <details key={student.id} className="panel section-panel">
            <summary><strong>{student.name}</strong> · {student.nis}</summary>
            <form action={updateStudent} className="admin-form">
              <input type="hidden" name="studentId" value={student.id} />
              <label>NIS<input name="nis" defaultValue={student.nis} required /></label>
              <label>NISN<input name="nisn" defaultValue={student.nisn ?? ""} /></label>
              <label>Nama lengkap<input name="name" defaultValue={student.name} required /></label>
              <label>Jenis kelamin
                <select name="gender" defaultValue={student.gender ?? ""}>
                  <option value="">Tidak diisi</option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              </label>
              <label>Tempat lahir<input name="birthPlace" defaultValue={student.birthPlace ?? ""} /></label>
              <label>Tanggal lahir<input type="date" name="birthDate" defaultValue={dateValue(student.birthDate)} /></label>
              <button type="submit" className="primary-button">Simpan Perubahan</button>
            </form>
          </details>
        ))}
      </section>

      <section className="panel section-panel">
        <h2>Ubah Status Siswa</h2>
        {students.length === 0 ? <p>Belum ada siswa.</p> : (
          <form action={changeStudentStatus} className="admin-form">
            <label>Siswa
              <select name="studentId" required defaultValue="">
                <option value="" disabled>Pilih siswa</option>
                {students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis} · {student.status}</option>)}
              </select>
            </label>
            <label>Status baru
              <select name="status" required defaultValue="ACTIVE">
                <option value="ACTIVE">Aktif</option>
                <option value="GRADUATED">Lulus</option>
                <option value="TRANSFERRED">Pindah sekolah</option>
                <option value="INACTIVE">Nonaktif</option>
              </select>
            </label>
            <label>Alasan<textarea name="reason" rows={3} required placeholder="Jelaskan alasan perubahan status" /></label>
            <button type="submit" className="primary-button">Ubah Status</button>
          </form>
        )}
      </section>

      <section className="panel section-panel">
        <h2>Pindah Rombel</h2>
        {activeEnrollments.length === 0 || classGroups.length === 0 ? <p>Belum ada enrollment aktif atau rombel tujuan.</p> : (
          <form action={transferEnrollment} className="admin-form">
            <label>Enrollment aktif
              <select name="enrollmentId" required defaultValue="">
                <option value="" disabled>Pilih siswa</option>
                {activeEnrollments.map(({ student, enrollment }) => (
                  <option key={enrollment.id} value={enrollment.id}>
                    {student.name} · {enrollment.academicYear.name} · {enrollment.classGroup.name}
                  </option>
                ))}
              </select>
            </label>
            <label>Rombel tujuan
              <select name="classGroupId" required defaultValue="">
                <option value="" disabled>Pilih rombel tujuan</option>
                {classGroups.map((group) => (
                  <option key={group.id} value={group.id} disabled={group._count.enrollments >= group.capacity}>
                    {group.academicYear.name} · {group.gradeLevel.name} · {group.name} · {group._count.enrollments}/{group.capacity}
                  </option>
                ))}
              </select>
            </label>
            <label>Alasan<textarea name="reason" rows={3} required placeholder="Contoh: penyesuaian rombel" /></label>
            <button type="submit" className="primary-button">Pindahkan Siswa</button>
          </form>
        )}
      </section>

      <section className="panel section-panel">
        <h2>Akhiri Enrollment</h2>
        {activeEnrollments.length === 0 ? <p>Belum ada enrollment aktif.</p> : (
          <form action={endEnrollment} className="admin-form">
            <label>Enrollment aktif
              <select name="enrollmentId" required defaultValue="">
                <option value="" disabled>Pilih enrollment</option>
                {activeEnrollments.map(({ student, enrollment }) => (
                  <option key={enrollment.id} value={enrollment.id}>
                    {student.name} · {enrollment.academicYear.name} · {enrollment.classGroup.name}
                  </option>
                ))}
              </select>
            </label>
            <label>Alasan<textarea name="reason" rows={3} required placeholder="Contoh: kenaikan kelas selesai" /></label>
            <button type="submit" className="secondary-button">Akhiri Enrollment</button>
          </form>
        )}
      </section>
    </div>
  );
}
