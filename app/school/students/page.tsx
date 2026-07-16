import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FlashMessage } from "@/components/flash-message";
import { ModalForm } from "@/components/modal-form";
import { prisma } from "@/lib/prisma";

import { createStudent } from "./actions";

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

const PAGE_SIZE = 25;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; q?: string; status?: string; enrollment?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");

  const schoolId = session.user.schoolId;
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const status = params.status?.trim() ?? "";
  const enrollment = params.enrollment?.trim() ?? "";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;

  const where = {
    schoolId,
    deletedAt: null,
    ...(status ? { status: status as "ACTIVE" | "GRADUATED" | "TRANSFERRED" | "INACTIVE" } : {}),
    ...(enrollment === "with" ? { enrollments: { some: { status: "ACTIVE" as const } } } : {}),
    ...(enrollment === "without" ? { enrollments: { none: { status: "ACTIVE" as const } } } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { nis: { contains: query, mode: "insensitive" as const } },
            { nisn: { contains: query, mode: "insensitive" as const } },
            { guardians: { some: { guardian: { name: { contains: query, mode: "insensitive" as const } } } } },
          ],
        }
      : {}),
  };

  const [school, totalStudents, filteredCount, students, activeCount, enrolledCount] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { studentLimit: true } }),
    prisma.student.count({ where: { schoolId, deletedAt: null } }),
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      include: {
        _count: { select: { guardians: true } },
        enrollments: {
          where: { status: "ACTIVE" },
          include: { academicYear: true, classGroup: { include: { gradeLevel: true } } },
          take: 1,
          orderBy: { startedAt: "desc" },
        },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.student.count({ where: { schoolId, deletedAt: null, status: "ACTIVE" } }),
    prisma.student.count({ where: { schoolId, deletedAt: null, enrollments: { some: { status: "ACTIVE" } } } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const hrefForPage = (targetPage: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (status) search.set("status", status);
    if (enrollment) search.set("enrollment", enrollment);
    search.set("page", String(targetPage));
    return `/school/students?${search}`;
  };

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Direktori siswa</span>
          <h1>Siswa</h1>
          <p>Cari siswa terlebih dahulu, lalu kelola wali, enrollment, profil, dan siklusnya dari satu halaman detail.</p>
        </div>
        <div className="dashboard-actions">
          <Link href="/school/students/guardians" className="secondary-button">Direktori Wali</Link>
          <Link href="/school/students/import" className="secondary-button">Import</Link>
          <ModalForm triggerLabel="Tambah Siswa" title="Tambah siswa baru" description="Simpan identitas dasar. Wali dan kelas ditambahkan setelah siswa dibuat.">
            <form action={createStudent} className="admin-form form-grid">
              <label>NIS<input name="nis" required autoFocus /></label>
              <label>NISN<input name="nisn" /></label>
              <label className="field-wide">Nama lengkap<input name="name" required /></label>
              <label>Jenis kelamin<select name="gender" defaultValue=""><option value="">Tidak diisi</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></label>
              <label>Tempat lahir<input name="birthPlace" /></label>
              <label>Tanggal lahir<input type="date" name="birthDate" /></label>
              <div className="form-actions field-wide"><button type="submit" className="primary-button">Simpan dan buka siswa</button></div>
            </form>
          </ModalForm>
        </div>
      </header>

      {params.error ? <FlashMessage tone="error" title="Perubahan belum tersimpan" message={errorMessages[params.error] ?? "Terjadi kesalahan. Periksa data dan coba kembali."} /> : null}
      {params.success ? <FlashMessage tone="success" title="Perubahan berhasil" message="Data siswa sudah diperbarui." /> : null}

      <section className="stats-grid">
        <article><span>Total siswa</span><strong>{totalStudents}</strong></article>
        <article><span>Siswa aktif</span><strong>{activeCount}</strong></article>
        <article><span>Enrollment aktif</span><strong>{enrolledCount}</strong></article>
        <article><span>Sisa kapasitas paket</span><strong>{Math.max(0, (school?.studentLimit ?? 0) - totalStudents)}</strong></article>
      </section>

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Temukan siswa</h2><p>Filter dijalankan di server dan tetap cepat untuk ribuan data.</p></div></div>
        <form className="filter-toolbar" method="get">
          <label className="search-field"><span aria-hidden="true">⌕</span><input name="q" defaultValue={query} placeholder="Nama, NIS, NISN, atau nama wali..." /></label>
          <label>Status<select name="status" defaultValue={status}><option value="">Semua status</option><option value="ACTIVE">Aktif</option><option value="GRADUATED">Lulus</option><option value="TRANSFERRED">Pindah sekolah</option><option value="INACTIVE">Nonaktif</option></select></label>
          <label>Kelas<select name="enrollment" defaultValue={enrollment}><option value="">Semua</option><option value="with">Sudah punya kelas</option><option value="without">Belum punya kelas</option></select></label>
          <button type="submit" className="primary-button">Terapkan</button>
          {query || status || enrollment ? <Link href="/school/students" className="text-button">Reset</Link> : null}
        </form>
      </section>

      <section className="panel table-panel">
        <div className="section-heading section-panel"><div><h2>Daftar siswa</h2><p>{filteredCount} hasil · halaman {safePage} dari {totalPages}</p></div></div>
        {students.length === 0 ? (
          <div className="empty-state"><strong>Siswa tidak ditemukan</strong><p>Ubah kata kunci atau filter, atau tambahkan siswa baru.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Siswa</th><th>Status</th><th>Enrollment aktif</th><th>Wali</th><th>Aksi</th></tr></thead>
              <tbody>{students.map((student) => {
                const current = student.enrollments[0];
                return <tr key={student.id}>
                  <td><strong>{student.name}</strong><small>NIS {student.nis}{student.nisn ? ` · NISN ${student.nisn}` : ""}</small></td>
                  <td><span className={`status-badge status-${student.status.toLowerCase()}`}>{student.status}</span></td>
                  <td>{current ? <><strong>{current.classGroup.gradeLevel.name} · {current.classGroup.name}</strong><small>{current.academicYear.name}</small></> : <span className="muted-text">Belum ditempatkan</span>}</td>
                  <td>{student._count.guardians} wali</td>
                  <td><Link className="primary-button" href={`/school/students/${student.id}`}>Buka workspace</Link></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
        {totalPages > 1 ? <nav className="pagination" aria-label="Pagination siswa"><Link href={hrefForPage(Math.max(1, safePage - 1))} aria-disabled={safePage === 1} className={safePage === 1 ? "secondary-button is-disabled" : "secondary-button"}>Sebelumnya</Link><span>Halaman {safePage} dari {totalPages}</span><Link href={hrefForPage(Math.min(totalPages, safePage + 1))} aria-disabled={safePage === totalPages} className={safePage === totalPages ? "secondary-button is-disabled" : "secondary-button"}>Berikutnya</Link></nav> : null}
      </section>
    </div>
  );
}
