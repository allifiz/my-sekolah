import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BulkSelectionControls } from "@/components/bulk-selection-controls";
import { ConfirmFormSubmit } from "@/components/confirm-form-submit";
import { FlashMessage } from "@/components/flash-message";
import { ModalForm } from "@/components/modal-form";
import { prisma } from "@/lib/prisma";

import { bulkEnrollStudents, createStudent } from "./actions";

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
  "invalid-bulk-enrollment": "Pilih minimal satu siswa dan satu rombel tujuan.",
  "bulk-student-invalid": "Sebagian siswa yang dipilih sudah tidak aktif atau tidak tersedia.",
};

const PAGE_SIZE = 25;
const BULK_FORM_ID = "bulk-enrollment-form";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; q?: string; status?: string; enrollment?: string; page?: string; count?: string; available?: string }>;
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

  const [school, totalStudents, filteredCount, students, activeCount, enrolledCount, classGroups] = await Promise.all([
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
    prisma.classGroup.findMany({
      where: { schoolId, isActive: true },
      include: {
        academicYear: true,
        gradeLevel: true,
        _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
      },
      orderBy: [{ academicYear: { startDate: "desc" } }, { gradeLevel: { order: "asc" } }, { name: "asc" }],
    }),
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

  let errorMessage = params.error ? errorMessages[params.error] ?? "Terjadi kesalahan. Periksa data dan coba kembali." : "";
  if (params.error === "bulk-enrollment-conflict") {
    errorMessage = `${params.count ?? "Beberapa"} siswa sudah memiliki enrollment pada tahun ajaran rombel tujuan. Tidak ada data yang diubah.`;
  }
  if (params.error === "bulk-class-full") {
    errorMessage = `Kapasitas rombel tidak mencukupi. Sisa kursi saat ini ${params.available ?? "0"}. Tidak ada siswa yang ditempatkan.`;
  }
  const successMessage = params.success === "bulk-enrolled"
    ? `${params.count ?? "Beberapa"} siswa berhasil ditempatkan ke rombel yang sama.`
    : "Data siswa sudah diperbarui.";

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

      {params.error ? <FlashMessage tone="error" title="Perubahan belum tersimpan" message={errorMessage} /> : null}
      {params.success ? <FlashMessage tone="success" title="Perubahan berhasil" message={successMessage} /> : null}

      <section className="stats-grid">
        <article><span>Total siswa</span><strong>{totalStudents}</strong></article>
        <article><span>Siswa aktif</span><strong>{activeCount}</strong></article>
        <article><span>Enrollment aktif</span><strong>{enrolledCount}</strong></article>
        <article><span>Belum punya rombel</span><strong>{Math.max(0, activeCount - enrolledCount)}</strong></article>
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

      <form action={bulkEnrollStudents} id={BULK_FORM_ID}>
        <section className="panel section-panel">
          <div className="section-heading">
            <div>
              <h2>Penempatan massal ke rombel</h2>
              <p>Tandai siswa aktif yang belum ditempatkan, pilih satu rombel, lalu simpan sekaligus. Maksimal 200 siswa per proses.</p>
            </div>
            {enrollment !== "without" ? <Link className="secondary-button" href="/school/students?status=ACTIVE&enrollment=without">Tampilkan yang belum punya rombel</Link> : null}
          </div>
          <BulkSelectionControls formId={BULK_FORM_ID} />
          <div className="filter-toolbar">
            <label>Rombel tujuan
              <select name="classGroupId" required defaultValue="">
                <option value="" disabled>Pilih rombel tujuan</option>
                {classGroups.map((group) => {
                  const available = Math.max(0, group.capacity - group._count.enrollments);
                  return <option key={group.id} value={group.id} disabled={available === 0}>{group.academicYear.name} · {group.gradeLevel.name} · {group.name} · {available} kursi</option>;
                })}
              </select>
            </label>
            <ConfirmFormSubmit
              formId={BULK_FORM_ID}
              triggerLabel="Tempatkan siswa terpilih"
              title="Tempatkan siswa ke rombel yang sama?"
              description="Semua siswa yang dicentang akan dibuatkan enrollment pada rombel tujuan. Proses dibatalkan seluruhnya jika ada konflik tahun ajaran atau kapasitas tidak cukup."
              confirmLabel="Ya, tempatkan semua"
              disabled={classGroups.length === 0}
            />
          </div>
          {classGroups.length === 0 ? <p className="muted-text">Belum ada rombel aktif yang dapat dipilih.</p> : null}
        </section>

        <section className="panel table-panel">
          <div className="section-heading section-panel"><div><h2>Daftar siswa</h2><p>{filteredCount} hasil · halaman {safePage} dari {totalPages}</p></div></div>
          {students.length === 0 ? (
            <div className="empty-state"><strong>Siswa tidak ditemukan</strong><p>Ubah kata kunci atau filter, atau tambahkan siswa baru.</p></div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th aria-label="Pilih siswa">Pilih</th><th>Siswa</th><th>Status</th><th>Enrollment aktif</th><th>Wali</th><th>Aksi</th></tr></thead>
                <tbody>{students.map((student) => {
                  const current = student.enrollments[0];
                  const eligible = student.status === "ACTIVE" && !current;
                  return <tr key={student.id}>
                    <td><input type="checkbox" name="studentIds" value={student.id} disabled={!eligible} aria-label={`Pilih ${student.name}`} title={eligible ? "Pilih untuk penempatan massal" : "Hanya siswa aktif tanpa enrollment yang dapat dipilih"} /></td>
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
      </form>
    </div>
  );
}
