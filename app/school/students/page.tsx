import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { createGuardian, createStudent, enrollStudent, linkStudentGuardian } from "./actions";

const errorMessages: Record<string, string> = {
  "invalid-student": "Data siswa belum valid.",
  "duplicate-student": "NIS atau NISN sudah digunakan.",
  "student-limit": "Batas jumlah siswa paket sekolah sudah tercapai.",
  "invalid-guardian": "Data wali belum valid.",
  "invalid-link": "Hubungan siswa dan wali belum valid.",
  "duplicate-link": "Wali tersebut sudah terhubung ke siswa.",
  "invalid-enrollment": "Data enrollment belum valid.",
  "duplicate-enrollment": "Siswa sudah memiliki enrollment pada tahun ajaran tersebut.",
  "class-full": "Kapasitas rombel sudah penuh.",
  "reference-not-found": "Siswa, wali, atau rombel tidak ditemukan.",
};

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");

  const schoolId = session.user.schoolId;
  const [school, students, guardians, classGroups, params] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { studentLimit: true } }),
    prisma.student.findMany({
      where: { schoolId, deletedAt: null },
      include: {
        guardians: { include: { guardian: true } },
        enrollments: {
          include: { academicYear: true, classGroup: { include: { gradeLevel: true } } },
          orderBy: { academicYear: { startDate: "desc" } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.guardian.findMany({
      where: { schoolId, deletedAt: null },
      include: { _count: { select: { students: true } } },
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

  const activeStudents = students.filter((student) => student.status === "ACTIVE");
  const enrolledStudentIds = new Set(
    students.flatMap((student) => student.enrollments.filter((item) => item.status === "ACTIVE").map(() => student.id)),
  );

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Data inti sekolah</span>
          <h1>Siswa, Wali, dan Enrollment</h1>
          <p>Kelola identitas siswa, hubungan wali, dan riwayat penempatan kelas per tahun ajaran.</p>
        </div>
      </header>

      {params.error ? (
        <section className="panel section-panel"><strong>Gagal:</strong> {errorMessages[params.error] ?? "Terjadi kesalahan."}</section>
      ) : null}
      {params.success ? (
        <section className="panel section-panel"><strong>Berhasil:</strong> Data siswa sudah diperbarui.</section>
      ) : null}

      <section className="stats-grid">
        <article><span>Total siswa</span><strong>{students.length}</strong></article>
        <article><span>Siswa aktif</span><strong>{activeStudents.length}</strong></article>
        <article><span>Sudah terdaftar kelas</span><strong>{enrolledStudentIds.size}</strong></article>
        <article><span>Limit paket</span><strong>{school?.studentLimit ?? 0}</strong></article>
      </section>

      <section className="panel section-panel">
        <h2>Tambah Siswa</h2>
        <form action={createStudent} className="admin-form">
          <label>NIS<input name="nis" required /></label>
          <label>NISN<input name="nisn" /></label>
          <label>Nama lengkap<input name="name" required /></label>
          <label>Jenis kelamin
            <select name="gender" defaultValue="">
              <option value="">Tidak diisi</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </label>
          <label>Tempat lahir<input name="birthPlace" /></label>
          <label>Tanggal lahir<input type="date" name="birthDate" /></label>
          <button type="submit" className="primary-button">Simpan Siswa</button>
        </form>
      </section>

      <section className="panel section-panel">
        <h2>Tambah Wali</h2>
        <form action={createGuardian} className="admin-form">
          <label>Nama lengkap<input name="name" required /></label>
          <label>Nomor telepon<input name="phone" /></label>
          <label>Email<input type="email" name="email" /></label>
          <label>Alamat<textarea name="address" rows={3} /></label>
          <button type="submit" className="primary-button">Simpan Wali</button>
        </form>
      </section>

      <section className="panel section-panel">
        <h2>Hubungkan Siswa dan Wali</h2>
        {students.length === 0 || guardians.length === 0 ? <p>Buat siswa dan wali terlebih dahulu.</p> : (
          <form action={linkStudentGuardian} className="admin-form">
            <label>Siswa
              <select name="studentId" required defaultValue="">
                <option value="" disabled>Pilih siswa</option>
                {students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis}</option>)}
              </select>
            </label>
            <label>Wali
              <select name="guardianId" required defaultValue="">
                <option value="" disabled>Pilih wali</option>
                {guardians.map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.name}{guardian.phone ? ` · ${guardian.phone}` : ""}</option>)}
              </select>
            </label>
            <label>Hubungan<input name="relationship" placeholder="Ayah, Ibu, Kakak, Wali" required /></label>
            <label><input type="checkbox" name="isPrimary" /> Jadikan wali utama</label>
            <button type="submit" className="primary-button">Hubungkan Wali</button>
          </form>
        )}
      </section>

      <section className="panel section-panel">
        <h2>Masukkan Siswa ke Rombel</h2>
        {activeStudents.length === 0 || classGroups.length === 0 ? <p>Buat siswa aktif dan rombel terlebih dahulu.</p> : (
          <form action={enrollStudent} className="admin-form">
            <label>Siswa
              <select name="studentId" required defaultValue="">
                <option value="" disabled>Pilih siswa</option>
                {activeStudents.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis}</option>)}
              </select>
            </label>
            <label>Rombongan belajar
              <select name="classGroupId" required defaultValue="">
                <option value="" disabled>Pilih rombel</option>
                {classGroups.map((group) => (
                  <option key={group.id} value={group.id} disabled={group._count.enrollments >= group.capacity}>
                    {group.academicYear.name} · {group.gradeLevel.name} · {group.name} · {group._count.enrollments}/{group.capacity}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="primary-button">Simpan Enrollment</button>
          </form>
        )}
      </section>

      <section className="panel section-panel">
        <h2>Daftar Siswa</h2>
        {students.length === 0 ? <p>Belum ada siswa.</p> : (
          <div className="stats-grid">
            {students.map((student) => {
              const currentEnrollment = student.enrollments.find((item) => item.status === "ACTIVE");
              return (
                <article key={student.id}>
                  <span>{student.nis}{student.nisn ? ` · NISN ${student.nisn}` : ""}</span>
                  <strong>{student.name}</strong>
                  <p>{currentEnrollment ? `${currentEnrollment.academicYear.name} · ${currentEnrollment.classGroup.gradeLevel.name} · ${currentEnrollment.classGroup.name}` : "Belum memiliki enrollment aktif"}</p>
                  <p>{student.guardians.length === 0 ? "Belum ada wali" : student.guardians.map((item) => `${item.guardian.name} (${item.relationship}${item.isPrimary ? ", utama" : ""})`).join(" · ")}</p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel section-panel">
        <h2>Daftar Wali</h2>
        {guardians.length === 0 ? <p>Belum ada wali.</p> : (
          <div className="stats-grid">
            {guardians.map((guardian) => (
              <article key={guardian.id}>
                <span>{guardian.phone ?? guardian.email ?? "Tanpa kontak"}</span>
                <strong>{guardian.name}</strong>
                <p>{guardian._count.students} siswa terhubung</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
