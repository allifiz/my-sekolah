import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FlashMessage } from "@/components/flash-message";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 24;

export default async function HomeroomsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; q?: string; year?: string; state?: string; page?: string }> }) {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const year = params.year ?? "";
  const state = params.state ?? "";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;

  const where = {
    schoolId: session.user.schoolId,
    isActive: true,
    ...(year ? { academicYearId: year } : {}),
    ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { gradeLevel: { name: { contains: query, mode: "insensitive" as const } } }] } : {}),
    ...(state === "assigned" ? { homeroomAssignments: { some: { isActive: true } } } : {}),
    ...(state === "unassigned" ? { homeroomAssignments: { none: { isActive: true } } } : {}),
  };

  const [years, total, classGroups, assignedCount] = await Promise.all([
    prisma.academicYear.findMany({ where: { schoolId: session.user.schoolId }, orderBy: { startDate: "desc" } }),
    prisma.classGroup.count({ where }),
    prisma.classGroup.findMany({ where, include: { academicYear: true, gradeLevel: true, homeroomAssignments: { where: { isActive: true }, include: { schoolMember: { include: { user: true } } }, take: 1 }, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } }, orderBy: [{ academicYear: { startDate: "desc" } }, { gradeLevel: { order: "asc" } }, { name: "asc" }], skip: (currentPage - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.classGroup.count({ where: { schoolId: session.user.schoolId, isActive: true, homeroomAssignments: { some: { isActive: true } } } }),
  ]);

  const totalActive = await prisma.classGroup.count({ where: { schoolId: session.user.schoolId, isActive: true } });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (page: number) => `/school/homerooms?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(year ? { year } : {}), ...(state ? { state } : {}), page: String(page) })}`;

  return <div className="admin-page">
    <header className="page-header"><div><span className="eyebrow">Struktur akademik</span><h1>Wali Kelas per Rombel</h1><p>Pilih rombel terlebih dahulu, lalu cari guru, ganti penugasan, dan lihat riwayat dari konteks rombel tersebut.</p></div></header>
    {params.error ? <FlashMessage tone="error" title="Penugasan gagal" message="Periksa rombel, guru, atau status penugasan." /> : null}
    {params.success ? <FlashMessage tone="success" title="Penugasan diperbarui" message="Perubahan wali kelas sudah tersimpan dalam riwayat." /> : null}

    <section className="stats-grid"><article><span>Rombel aktif</span><strong>{totalActive}</strong></article><article><span>Sudah memiliki wali</span><strong>{assignedCount}</strong></article><article><span>Belum memiliki wali</span><strong>{Math.max(totalActive - assignedCount, 0)}</strong></article><article><span>Hasil filter</span><strong>{total}</strong></article></section>

    <section className="panel section-panel toolbar-panel"><form method="get" className="filter-toolbar"><label>Cari rombel<input name="q" defaultValue={query} placeholder="Nama rombel atau tingkat..." /></label><label>Tahun ajaran<select name="year" defaultValue={year}><option value="">Semua tahun</option>{years.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isActive ? " · Aktif" : ""}</option>)}</select></label><label>Status wali<select name="state" defaultValue={state}><option value="">Semua</option><option value="assigned">Sudah ditugaskan</option><option value="unassigned">Belum ditugaskan</option></select></label><button className="secondary-button" type="submit">Terapkan</button>{query || year || state ? <Link className="text-button" href="/school/homerooms">Reset</Link> : null}</form></section>

    <section className="panel section-panel"><div className="section-heading"><div><h2>Daftar rombel</h2><p>{total} rombel sesuai filter. Buka satu rombel untuk mengelola wali kelasnya.</p></div></div>{classGroups.length === 0 ? <div className="empty-state"><strong>Tidak ada rombel yang cocok</strong><p>Ubah filter atau buat rombel aktif terlebih dahulu.</p></div> : <div className="management-grid">{classGroups.map((group) => { const assignment = group.homeroomAssignments[0]; return <article className="management-card" key={group.id}><div className="management-card-head"><div><strong>{group.gradeLevel.name} · {group.name}</strong><p>{group.academicYear.name}</p></div><span className={`status-badge ${assignment ? "status-active" : "status-trial"}`}>{assignment ? "SUDAH ADA WALI" : "BELUM ADA WALI"}</span></div><p>{group._count.enrollments} siswa aktif</p><p>{assignment ? `Wali kelas: ${assignment.schoolMember.user.name ?? assignment.schoolMember.user.email}` : "Pilih guru untuk mengisi penugasan."}</p><Link className="primary-button" href={`/school/homerooms/${group.id}`}>{assignment ? "Kelola penugasan" : "Tetapkan wali kelas"}</Link></article>; })}</div>}
      {totalPages > 1 ? <nav className="pagination"><Link href={pageHref(Math.max(1, currentPage - 1))} className={currentPage === 1 ? "secondary-button is-disabled" : "secondary-button"}>Sebelumnya</Link><span>Halaman {currentPage} dari {totalPages}</span><Link href={pageHref(Math.min(totalPages, currentPage + 1))} className={currentPage === totalPages ? "secondary-button is-disabled" : "secondary-button"}>Berikutnya</Link></nav> : null}
    </section>
  </div>;
}
