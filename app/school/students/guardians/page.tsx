import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ConfirmAction } from "@/components/confirm-action";
import { FlashMessage } from "@/components/flash-message";
import { ModalForm } from "@/components/modal-form";
import { prisma } from "@/lib/prisma";

import { createGuardian } from "../actions";
import { archiveGuardian } from "../delete-actions";

const PAGE_SIZE = 25;

export default async function GuardiansPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; error?: string; success?: string }> }) {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
  const schoolId = session.user.schoolId;
  const where = { schoolId, deletedAt: null, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const [count, guardians] = await Promise.all([
    prisma.guardian.count({ where }),
    prisma.guardian.findMany({ where, include: { students: { include: { student: true }, take: 5 }, _count: { select: { students: true } } }, orderBy: { name: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hrefForPage = (target: number) => `/school/students/guardians?${new URLSearchParams({ ...(q ? { q } : {}), page: String(target) })}`;

  return <div className="admin-page">
    <header className="page-header"><div><span className="eyebrow">Direktori wali</span><h1>Wali Siswa</h1><p>Cari satu wali tanpa membuka dropdown ribuan data. Penautan ke siswa dilakukan dari workspace siswa.</p></div><div className="dashboard-actions"><Link href="/school/students" className="secondary-button">Kembali ke siswa</Link><ModalForm triggerLabel="Tambah Wali" title="Tambah wali" description="Setelah dibuat, cari siswa lalu tautkan wali dari workspace siswa."><form action={createGuardian} className="admin-form"><label>Nama lengkap<input name="name" required /></label><label>Nomor telepon<input name="phone" /></label><label>Email<input type="email" name="email" /></label><label>Alamat<textarea name="address" rows={3} /></label><div className="form-actions"><button className="primary-button" type="submit">Simpan wali</button></div></form></ModalForm></div></header>
    {params.error ? <FlashMessage tone="error" title="Perubahan gagal" message="Periksa data dan coba kembali." /> : null}
    {params.success ? <FlashMessage tone="success" title="Perubahan berhasil" message="Data wali telah diperbarui." /> : null}
    <section className="panel section-panel"><form className="filter-toolbar" method="get"><label className="search-field"><span aria-hidden="true">⌕</span><input name="q" defaultValue={q} placeholder="Nama, telepon, atau email..." /></label><button className="primary-button" type="submit">Cari</button>{q ? <Link href="/school/students/guardians" className="text-button">Reset</Link> : null}</form></section>
    <section className="panel table-panel"><div className="section-heading section-panel"><div><h2>Daftar wali</h2><p>{count} wali ditemukan.</p></div></div>{guardians.length === 0 ? <div className="empty-state"><strong>Wali tidak ditemukan</strong><p>Ubah pencarian atau tambahkan wali baru.</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Wali</th><th>Kontak</th><th>Siswa tertaut</th><th>Aksi</th></tr></thead><tbody>{guardians.map((guardian) => <tr key={guardian.id}><td><strong>{guardian.name}</strong><small>{guardian.address ?? "Alamat belum diisi"}</small></td><td>{guardian.phone ?? "-"}<small>{guardian.email ?? "Email belum diisi"}</small></td><td><strong>{guardian._count.students} siswa</strong><small>{guardian.students.map((item) => item.student.name).join(", ")}{guardian._count.students > 5 ? "…" : ""}</small></td><td>{guardian._count.students === 0 ? <ConfirmAction action={archiveGuardian} title="Arsipkan wali?" description="Wali akan disembunyikan dari pencarian aktif dan tetap tercatat di audit log." triggerLabel="Arsipkan" confirmLabel="Ya, arsipkan"><input type="hidden" name="guardianId" value={guardian.id} /></ConfirmAction> : <span className="muted-text">Lepaskan dari siswa terlebih dahulu</span>}</td></tr>)}</tbody></table></div>}{totalPages > 1 ? <nav className="pagination"><Link href={hrefForPage(Math.max(1, page - 1))} className={page === 1 ? "secondary-button is-disabled" : "secondary-button"}>Sebelumnya</Link><span>Halaman {page} dari {totalPages}</span><Link href={hrefForPage(Math.min(totalPages, page + 1))} className={page === totalPages ? "secondary-button is-disabled" : "secondary-button"}>Berikutnya</Link></nav> : null}</section>
  </div>;
}
