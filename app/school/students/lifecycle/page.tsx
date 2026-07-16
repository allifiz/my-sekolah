import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 30;

export default async function StudentLifecyclePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; enrollment?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status?.trim() ?? "";
  const enrollment = params.enrollment?.trim() ?? "";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
  const schoolId = session.user.schoolId;

  const where = {
    schoolId,
    deletedAt: null,
    ...(status ? { status: status as "ACTIVE" | "GRADUATED" | "TRANSFERRED" | "INACTIVE" } : {}),
    ...(enrollment === "active" ? { enrollments: { some: { status: "ACTIVE" as const } } } : {}),
    ...(enrollment === "none" ? { enrollments: { none: { status: "ACTIVE" as const } } } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { nis: { contains: q, mode: "insensitive" as const } }, { nisn: { contains: q, mode: "insensitive" as const } }] } : {}),
  };

  const [count, students, activeCount, withoutEnrollmentCount] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      include: {
        enrollments: {
          where: { status: "ACTIVE" },
          include: { academicYear: true, classGroup: { include: { gradeLevel: true } } },
          take: 1,
        },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.student.count({ where: { schoolId, deletedAt: null, status: "ACTIVE" } }),
    prisma.student.count({ where: { schoolId, deletedAt: null, enrollments: { none: { status: "ACTIVE" } } } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hrefForPage = (target: number) => `/school/students/lifecycle?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(enrollment ? { enrollment } : {}), page: String(target) })}`;

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Antrian siklus siswa</span>
          <h1>Siklus Siswa</h1>
          <p>Temukan siswa yang perlu diproses, lalu buka workspace siswa untuk edit profil, ubah status, pindah kelas, atau mengakhiri enrollment.</p>
        </div>
        <Link href="/school/students" className="secondary-button">Kembali ke Direktori</Link>
      </header>

      <section className="stats-grid">
        <article><span>Siswa aktif</span><strong>{activeCount}</strong></article>
        <article><span>Tanpa enrollment aktif</span><strong>{withoutEnrollmentCount}</strong></article>
        <article><span>Hasil filter</span><strong>{count}</strong></article>
        <article><span>Per halaman</span><strong>{PAGE_SIZE}</strong></article>
      </section>

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Filter antrian</h2><p>Tidak ada lagi form untuk seluruh siswa sekaligus. Pilih satu siswa dan kerjakan dalam konteksnya.</p></div></div>
        <form className="filter-toolbar" method="get">
          <label className="search-field"><span aria-hidden="true">⌕</span><input name="q" defaultValue={q} placeholder="Nama, NIS, atau NISN..." /></label>
          <label>Status<select name="status" defaultValue={status}><option value="">Semua status</option><option value="ACTIVE">Aktif</option><option value="GRADUATED">Lulus</option><option value="TRANSFERRED">Pindah sekolah</option><option value="INACTIVE">Nonaktif</option></select></label>
          <label>Enrollment<select name="enrollment" defaultValue={enrollment}><option value="">Semua</option><option value="active">Ada enrollment aktif</option><option value="none">Tanpa enrollment aktif</option></select></label>
          <button className="primary-button" type="submit">Terapkan</button>
          {q || status || enrollment ? <Link href="/school/students/lifecycle" className="text-button">Reset</Link> : null}
        </form>
      </section>

      <section className="panel table-panel">
        {students.length === 0 ? <div className="empty-state"><strong>Tidak ada siswa dalam antrian ini</strong><p>Ubah filter untuk melihat siswa lainnya.</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Siswa</th><th>Status</th><th>Enrollment aktif</th><th>Tindakan tersedia</th></tr></thead><tbody>{students.map((student) => { const current = student.enrollments[0]; return <tr key={student.id}><td><strong>{student.name}</strong><small>NIS {student.nis}{student.nisn ? ` · NISN ${student.nisn}` : ""}</small></td><td><span className={`status-badge status-${student.status.toLowerCase()}`}>{student.status}</span></td><td>{current ? <><strong>{current.classGroup.gradeLevel.name} · {current.classGroup.name}</strong><small>{current.academicYear.name}</small></> : <span className="muted-text">Belum ada</span>}</td><td><Link className="primary-button" href={`/school/students/${student.id}#lifecycle`}>Buka tindakan</Link></td></tr>; })}</tbody></table></div>}
        {totalPages > 1 ? <nav className="pagination"><Link href={hrefForPage(Math.max(1, page - 1))} className={page === 1 ? "secondary-button is-disabled" : "secondary-button"}>Sebelumnya</Link><span>Halaman {page} dari {totalPages}</span><Link href={hrefForPage(Math.min(totalPages, page + 1))} className={page === totalPages ? "secondary-button is-disabled" : "secondary-button"}>Berikutnya</Link></nav> : null}
      </section>
    </div>
  );
}
