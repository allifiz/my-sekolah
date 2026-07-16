import { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FlashMessage } from "@/components/flash-message";
import { ModalForm } from "@/components/modal-form";
import { prisma } from "@/lib/prisma";

import { inviteGuardian } from "./actions";

const PAGE_SIZE = 25;

type ActiveAccount = { guardianId: string; email: string };
type LatestInvitation = { guardianId: string; email: string; expiresAt: Date };

export default async function GuardianPortalManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; q?: string; state?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const member = await prisma.schoolMember.findFirst({ where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal"] } } } } }, select: { id: true } });
  if (!member) redirect("/school?error=forbidden");

  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const state = params.state ?? "";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;

  const baseWhere: Prisma.GuardianWhereInput = {
    schoolId: session.user.schoolId,
    deletedAt: null,
    ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { phone: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }, { students: { some: { student: { name: { contains: query, mode: "insensitive" } } } } }] } : {}),
    ...(state === "no-email" ? { email: null } : {}),
    ...(state === "unlinked" ? { students: { none: {} } } : {}),
  };

  const [total, guardians] = await Promise.all([
    prisma.guardian.count({ where: baseWhere }),
    prisma.guardian.findMany({ where: baseWhere, include: { students: { include: { student: true }, take: 4 }, _count: { select: { students: true } } }, orderBy: { name: "asc" }, skip: (currentPage - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);

  const ids = guardians.map((guardian) => guardian.id);
  const [active, invitations] = ids.length ? await Promise.all([
    prisma.$queryRaw<ActiveAccount[]>(Prisma.sql`SELECT ga."guardianId", u."email" FROM "GuardianAccount" ga JOIN "User" u ON u."id" = ga."userId" WHERE ga."schoolId" = ${session.user.schoolId} AND ga."guardianId" IN (${Prisma.join(ids)})`),
    prisma.$queryRaw<LatestInvitation[]>(Prisma.sql`SELECT DISTINCT ON (gi."guardianId") gi."guardianId", gi."email", gi."expiresAt" FROM "GuardianInvitation" gi WHERE gi."schoolId" = ${session.user.schoolId} AND gi."guardianId" IN (${Prisma.join(ids)}) ORDER BY gi."guardianId", gi."createdAt" DESC`),
  ]) : [[], []];

  const activeMap = new Map(active.map((item) => [item.guardianId, item.email]));
  const invitationMap = new Map(invitations.map((item) => [item.guardianId, item]));
  const filteredGuardians = guardians.filter((guardian) => {
    const isActive = activeMap.has(guardian.id);
    const invitation = invitationMap.get(guardian.id);
    const pending = Boolean(invitation && invitation.expiresAt > new Date());
    if (state === "active") return isActive;
    if (state === "pending") return !isActive && pending;
    if (state === "inactive") return !isActive && !pending;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (page: number) => `/school/guardians/portal?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(state ? { state } : {}), page: String(page) })}`;

  return <div className="admin-page">
    <header className="page-header"><div><span className="eyebrow">Akses wali</span><h1>Portal Wali</h1><p>Cari wali, tinjau siswa yang dapat diakses, lalu kirim aktivasi dari konteks wali yang tepat.</p></div><Link href="/school/students/guardians" className="secondary-button">Direktori wali</Link></header>
    {params.success ? <FlashMessage tone="success" title="Undangan portal dibuat" message={params.success === "sent" ? "Email aktivasi berhasil dikirim." : "Undangan tersimpan, tetapi layanan email belum mengirim pesan."} /> : null}
    {params.error ? <FlashMessage tone="error" title="Aktivasi gagal" message="Periksa wali, alamat email, atau status akun portal." /> : null}

    <section className="panel section-panel toolbar-panel"><form className="filter-toolbar" method="get"><label>Cari wali<input name="q" defaultValue={query} placeholder="Nama, telepon, email, atau siswa..." /></label><label>Status<select name="state" defaultValue={state}><option value="">Semua</option><option value="active">Sudah aktif</option><option value="pending">Undangan aktif</option><option value="inactive">Belum diundang</option><option value="no-email">Tanpa email</option><option value="unlinked">Belum terhubung siswa</option></select></label><button className="secondary-button" type="submit">Terapkan</button>{query || state ? <Link href="/school/guardians/portal" className="text-button">Reset</Link> : null}</form></section>

    <section className="panel section-panel"><div className="section-heading"><div><h2>Daftar akses wali</h2><p>{total} wali sesuai pencarian. Data dimuat {PAGE_SIZE} per halaman.</p></div></div>
      {filteredGuardians.length === 0 ? <div className="empty-state"><strong>Tidak ada wali yang cocok</strong><p>Ubah pencarian atau filter status.</p></div> : <div className="management-grid">{filteredGuardians.map((guardian) => {
        const accountEmail = activeMap.get(guardian.id);
        const invitation = invitationMap.get(guardian.id);
        const pending = Boolean(invitation && invitation.expiresAt > new Date());
        const statusLabel = accountEmail ? "AKTIF" : pending ? "UNDANGAN AKTIF" : "BELUM AKTIF";
        return <article className="management-card" key={guardian.id}><div className="management-card-head"><div><strong>{guardian.name}</strong><p>{accountEmail ?? invitation?.email ?? guardian.email ?? "Email belum tersedia"}</p></div><span className={`status-badge ${accountEmail ? "status-active" : pending ? "status-trial" : "status-cancelled"}`}>{statusLabel}</span></div><p>{guardian._count.students} siswa terhubung</p><p>{guardian.students.map((item) => item.student.name).join(", ") || "Belum terhubung dengan siswa"}{guardian._count.students > guardian.students.length ? ` dan ${guardian._count.students - guardian.students.length} lainnya` : ""}</p>
          {!accountEmail && !pending ? <ModalForm action={inviteGuardian} triggerLabel="Kirim aktivasi" triggerClassName="primary-button" title={`Aktifkan portal untuk ${guardian.name}`} description={guardian._count.students === 0 ? "Wali ini belum terhubung ke siswa. Pastikan akses memang perlu dibuat." : `Akun akan dapat melihat ${guardian._count.students} siswa yang terhubung.`} submitLabel="Kirim aktivasi"><input type="hidden" name="guardianId" value={guardian.id} /><label>Email akun<input type="email" name="email" defaultValue={guardian.email ?? ""} required autoFocus /></label><p className="helper-text">Email ini juga disimpan sebagai email kontak wali.</p></ModalForm> : null}
          {pending ? <p><small>Undangan berlaku sampai {invitation!.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}.</small></p> : null}
        </article>;
      })}</div>}
      {totalPages > 1 ? <nav className="pagination"><Link href={pageHref(Math.max(1, currentPage - 1))} className={currentPage === 1 ? "secondary-button is-disabled" : "secondary-button"}>Sebelumnya</Link><span>Halaman {currentPage} dari {totalPages}</span><Link href={pageHref(Math.min(totalPages, currentPage + 1))} className={currentPage === totalPages ? "secondary-button is-disabled" : "secondary-button"}>Berikutnya</Link></nav> : null}
    </section>
  </div>;
}
