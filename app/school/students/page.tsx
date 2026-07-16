import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FlashMessage } from "@/components/flash-message";
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

const PAGE_SIZE = 12;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; q?: string; page?: string }>;
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
  const query = params.q?.trim().toLocaleLowerCase("id-ID") ?? "";
  const filteredStudents = query
    ? students.filter((student) => {
        const guardianNames = student.guardians.map((item) => item.guardian.name).join(" ");
        return `${student.name} ${student.nis} ${student.nisn ?? ""} ${guardianNames}`.toLocaleLowerCase("id-ID").includes(query);
      })
    : students;
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), totalPages) : 1;
  const visibleStudents = filteredStudents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageHref = (page: number) => `/school/students?${new URLSearchParams({ ...(query ? { q: params.q ?? "" } : {}), page: String(page) })}`;

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Data inti sekolah</span>
          <h1>Siswa, Wali, dan Enrollment</h1>
          <p>Kelola identitas siswa, hubungan wali, dan riwayat penempatan kelas per tahun ajaran.</p>
        </div>
        <div className="dashboard-actions">
          <Link href="/school/students/import" className="secondary-button">Import data</Link>
          <Link href="/school/students/export" className="primary-button">Export siswa</Link>
        </div>
      </header>

      {params.error ? <FlashMessage tone="error" title="Perubahan belum tersimpan" message={errorMessages[params.error] ?? "Terjadi kesalahan. Periksa data dan coba kembali."} /> : null}
      {params.success ? <FlashMessage tone="success" title="Perubahan berhasil" message="Data siswa dan wali sudah diperbarui." /> : null}

      <section className="stats-grid">
        <article><span>Total siswa</span><strong>{students.length}</strong></article>
        <article><span>Siswa aktif</span><strong>{activeStudents.length}</strong></article>
        <article><span>Sudah terdaftar kelas</span><strong>{enrolledStudentIds.size}</strong></article>
        <article><span>Limit paket</span><strong>{school?.studentLimit ?? 0}</strong></article>
      </section>

      <section className="content-grid form-workspace">
        <div className="panel section-panel">
          <div className="section-heading"><div><h2>Tambah Siswa</h2><p>Masukkan identitas dasar siswa baru.</p></div></div>
          <form action={createStudent} className="admin-form form-grid">
            <label>NIS<input name="nis" required /></label>
            <label>NISN<input name="nisn" /></label>
            <label className="field-wide">Nama lengkap<input name="name" required /></label>
            <label>Jenis kelamin<select name="gender" defaultValue=""><option value="">Tidak diisi</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></label>
            <label>Tempat lahir<input name="birthPlace" /></label>
            <label>Tanggal lahir<input type="date" name="birthDate" /></label>
            <div className="form-actions field-wide"><button type="submit" className="primary-button">Simpan Siswa</button></div>
          </form>
        </div>

        <div className="panel section-panel">
          <div className="section-heading"><div><h2>Tambah Wali</h2><p>Simpan kontak orang tua atau wali.</p></div></div>
          <form action={createGuardian} className="admin-form">
            <label>Nama lengkap<input name="name" required /></label>
            <label>Nomor telepon<input name="phone" /></label>
            <label>Email<input type="email" name="email" /></label>
            <label>Alamat<textarea name="address" rows={3} /></label>
            <div className="form-actions"><button type="submit" className="primary-button">Simpan Wali</button></div>
          </form>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel section-panel">
          <div className="section-heading"><div><h2>Hubungkan Siswa dan Wali</h2><p>Tentukan hubungan dan wali utama.</p></div></div>
          {students.length === 0 || guardians.length === 0 ? <div className="empty-state compact-empty"><strong>Data belum siap</strong><p>Buat siswa dan wali terlebih dahulu.</p></div> : (
            <form action={linkStudentGuardian} className="admin-form">
              <label>Siswa<select name="studentId" required defaultValue=""><option value="" disabled>Pilih siswa</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis}</option>)}</select></label>
              <label>Wali<select name="guardianId" required defaultValue=""><option value="" disabled>Pilih wali</option>{guardians.map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.name}{guardian.phone ? ` · ${guardian.phone}` : ""}</option>)}</select></label>
              <label>Hubungan<input name="relationship" placeholder="Ayah, Ibu, Kakak, Wali" required /></label>
              <label className="checkbox-field"><input type="checkbox" name="isPrimary" /> Jadikan wali utama</label>
              <div className="form-actions"><button type="submit" className="primary-button">Hubungkan Wali</button></div>
            </form>
          )}
        </div>

        <div className="panel section-panel">
          <div className="section-heading"><div><h2>Masukkan ke Rombel</h2><p>Tempatkan siswa aktif ke kelas.</p></div></div>
          {activeStudents.length === 0 || classGroups.length === 0 ? <div className="empty-state compact-empty"><strong>Belum dapat membuat enrollment</strong><p>Buat siswa aktif dan rombel terlebih dahulu.</p></div> : (
            <form action={enrollStudent} className="admin-form">
              <label>Siswa<select name="studentId" required defaultValue=""><option value="" disabled>Pilih siswa</option>{activeStudents.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis}</option>)}</select></label>
              <label>Rombongan belajar<select name="classGroupId" required defaultValue=""><option value="" disabled>Pilih rombel</option>{classGroups.map((group) => <option key={group.id} value={group.id} disabled={group._count.enrollments >= group.capacity}>{group.academicYear.name} · {group.gradeLevel.name} · {group.name} · {group._count.enrollments}/{group.capacity}</option>)}</select></label>
              <div className="form-actions"><button type="submit" className="primary-button">Simpan Enrollment</button></div>
            </form>
          )}
        </div>
      </section>

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Daftar Siswa</h2><p>{filteredStudents.length} siswa ditemukan.</p></div></div>
        <form className="list-toolbar" method="get">
          <label className="search-field"><span aria-hidden="true">⌕</span><input name="q" defaultValue={params.q ?? ""} placeholder="Cari nama, NIS, NISN, atau wali..." /></label>
          <button type="submit" className="secondary-button">Cari</button>
          {query ? <Link href="/school/students" className="text-button">Reset</Link> : null}
        </form>
        {visibleStudents.length === 0 ? <div className="empty-state"><strong>{query ? "Siswa tidak ditemukan" : "Belum ada siswa"}</strong><p>{query ? "Coba kata kunci lain atau hapus filter pencarian." : "Tambahkan siswa pertama melalui formulir di atas."}</p></div> : (
          <div className="student-list-grid">
            {visibleStudents.map((student) => {
              const currentEnrollment = student.enrollments.find((item) => item.status === "ACTIVE");
              return <article className="student-card" key={student.id}><div className="student-avatar" aria-hidden="true">{student.name.slice(0, 2).toUpperCase()}</div><div><span>{student.nis}{student.nisn ? ` · NISN ${student.nisn}` : ""}</span><strong>{student.name}</strong><p>{currentEnrollment ? `${currentEnrollment.academicYear.name} · ${currentEnrollment.classGroup.gradeLevel.name} · ${currentEnrollment.classGroup.name}` : "Belum memiliki enrollment aktif"}</p><small>{student.guardians.length === 0 ? "Belum ada wali" : student.guardians.map((item) => `${item.guardian.name} (${item.relationship}${item.isPrimary ? ", utama" : ""})`).join(" · ")}</small></div></article>;
            })}
          </div>
        )}
        {totalPages > 1 ? <nav className="pagination" aria-label="Pagination siswa"><Link href={pageHref(Math.max(1, currentPage - 1))} aria-disabled={currentPage === 1} className={currentPage === 1 ? "secondary-button is-disabled" : "secondary-button"}>Sebelumnya</Link><span>Halaman {currentPage} dari {totalPages}</span><Link href={pageHref(Math.min(totalPages, currentPage + 1))} aria-disabled={currentPage === totalPages} className={currentPage === totalPages ? "secondary-button is-disabled" : "secondary-button"}>Berikutnya</Link></nav> : null}
      </section>

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Daftar Wali</h2><p>{guardians.length} wali tersimpan.</p></div></div>
        {guardians.length === 0 ? <div className="empty-state compact-empty"><strong>Belum ada wali</strong><p>Tambahkan data wali melalui formulir di atas.</p></div> : <div className="guardian-card-grid">{guardians.map((guardian) => <article className="guardian-card" key={guardian.id}><span>{guardian.phone ?? guardian.email ?? "Tanpa kontak"}</span><strong>{guardian.name}</strong><p>{guardian._count.students} siswa terhubung</p></article>)}</div>}
      </section>
    </div>
  );
}
