import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ConfirmAction } from "@/components/confirm-action";
import { FlashMessage } from "@/components/flash-message";
import { ModalForm } from "@/components/modal-form";
import { prisma } from "@/lib/prisma";

import { inviteStaff, revokeInvitation, updateMemberRole, updateMemberStatus } from "./actions";

const PAGE_SIZE = 24;

const errors: Record<string, string> = {
  "invalid-invitation": "Data undangan belum valid.",
  "reference-not-found": "Role, anggota, atau sekolah tidak ditemukan.",
  "user-limit": "Batas pengguna sekolah sudah tercapai.",
  "duplicate-invitation": "Email tersebut masih memiliki undangan aktif.",
  "already-member": "Email tersebut sudah menjadi anggota sekolah.",
  "invitation-not-found": "Undangan tidak ditemukan atau sudah tidak aktif.",
  "invalid-member": "Perubahan status anggota tidak valid.",
  "invalid-role": "Perubahan role anggota tidak valid.",
  "member-not-found": "Anggota tidak ditemukan.",
  "last-owner": "School Owner aktif terakhir tidak boleh dinonaktifkan.",
  "owner-role-protected": "Role School Owner dilindungi dan tidak dapat diganti dari halaman ini.",
};

export default async function SchoolMembersPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; delivery?: string; q?: string; status?: string; tab?: string; page?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const status = params.status ?? "";
  const tab = params.tab === "invitations" ? "invitations" : "members";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;

  const actor = await prisma.schoolMember.findFirst({ where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null }, include: { roles: { include: { role: true } } } });
  if (!actor) redirect("/school?error=forbidden");
  const canManage = actor.roles.some(({ role }) => ["school-owner", "school-admin"].includes(role.key));

  const memberWhere = {
    schoolId: session.user.schoolId,
    deletedAt: null,
    ...(status ? { status: status as "ACTIVE" | "SUSPENDED" | "LEFT" | "INVITED" } : {}),
    ...(query ? { user: { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { email: { contains: query, mode: "insensitive" as const } }] } } : {}),
  };
  const invitationWhere = { schoolId: session.user.schoolId, ...(query ? { email: { contains: query, mode: "insensitive" as const } } : {}) };

  const [school, roles, activeCount, totalMembers, members, totalInvitations, invitations] = await Promise.all([
    prisma.school.findUnique({ where: { id: session.user.schoolId }, select: { userLimit: true } }),
    prisma.role.findMany({ where: { schoolId: session.user.schoolId, key: { in: ["school-admin", "principal", "finance", "teacher", "homeroom-teacher"] } }, orderBy: { name: "asc" } }),
    prisma.schoolMember.count({ where: { schoolId: session.user.schoolId, deletedAt: null, status: "ACTIVE" } }),
    prisma.schoolMember.count({ where: memberWhere }),
    tab === "members" ? prisma.schoolMember.findMany({ where: memberWhere, include: { user: true, roles: { include: { role: true } }, homeroomAssignments: { where: { isActive: true }, include: { classGroup: true } } }, orderBy: { createdAt: "asc" }, skip: (currentPage - 1) * PAGE_SIZE, take: PAGE_SIZE }) : Promise.resolve([]),
    prisma.invitation.count({ where: invitationWhere }),
    tab === "invitations" ? prisma.invitation.findMany({ where: invitationWhere, orderBy: { createdAt: "desc" }, skip: (currentPage - 1) * PAGE_SIZE, take: PAGE_SIZE }) : Promise.resolve([]),
  ]);

  const total = tab === "members" ? totalMembers : totalInvitations;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (page: number) => `/school/members?${new URLSearchParams({ tab, ...(query ? { q: query } : {}), ...(status && tab === "members" ? { status } : {}), page: String(page) })}`;

  return <div className="admin-page">
    <header className="page-header"><div><span className="eyebrow">Akses sekolah</span><h1>Anggota dan Undangan</h1><p>Cari anggota, tinjau role dan penugasan, lalu lakukan perubahan akses melalui dialog yang eksplisit.</p></div>{canManage ? <ModalForm action={inviteStaff} triggerLabel="Undang staf" title="Kirim undangan staf" description="Pilih role awal. Role dapat diperbarui setelah staf menjadi anggota aktif." submitLabel="Kirim undangan"><label>Email<input name="email" type="email" required autoFocus /></label><label>Role awal<select name="roleKey" required defaultValue="teacher">{roles.map((role) => <option key={role.id} value={role.key}>{role.name}</option>)}</select></label></ModalForm> : null}</header>
    {params.error ? <FlashMessage tone="error" title="Perubahan gagal" message={errors[params.error] ?? "Terjadi kesalahan."} /> : null}
    {params.success ? <FlashMessage tone={params.delivery === "pending" ? "info" : "success"} title="Data diperbarui" message={params.delivery === "pending" ? "Undangan tersimpan, tetapi email belum terkirim." : "Perubahan akses berhasil disimpan."} /> : null}

    <section className="stats-grid"><article><span>Pengguna aktif</span><strong>{activeCount}</strong></article><article><span>Batas paket</span><strong>{school?.userLimit ?? 0}</strong></article><article><span>Sisa kapasitas</span><strong>{Math.max((school?.userLimit ?? 0) - activeCount, 0)}</strong></article><article><span>Total undangan</span><strong>{totalInvitations}</strong></article></section>

    <nav className="button-row"><Link href="/school/members?tab=members" className={tab === "members" ? "primary-button" : "secondary-button"}>Anggota</Link><Link href="/school/members?tab=invitations" className={tab === "invitations" ? "primary-button" : "secondary-button"}>Undangan</Link></nav>

    <section className="panel section-panel toolbar-panel"><form className="filter-toolbar" method="get"><input type="hidden" name="tab" value={tab} /><label>Cari<input name="q" defaultValue={query} placeholder={tab === "members" ? "Nama atau email anggota..." : "Email undangan..."} /></label>{tab === "members" ? <label>Status<select name="status" defaultValue={status}><option value="">Semua status</option><option value="ACTIVE">Aktif</option><option value="SUSPENDED">Ditangguhkan</option><option value="LEFT">Keluar</option></select></label> : null}<button className="secondary-button" type="submit">Terapkan</button>{query || status ? <Link className="text-button" href={`/school/members?tab=${tab}`}>Reset</Link> : null}</form></section>

    {tab === "members" ? <section className="panel section-panel"><div className="section-heading"><div><h2>Anggota sekolah</h2><p>{totalMembers} anggota sesuai filter. Data dimuat {PAGE_SIZE} per halaman.</p></div></div>{members.length === 0 ? <div className="empty-state"><strong>Tidak ada anggota yang cocok</strong><p>Ubah filter atau kirim undangan staf baru.</p></div> : <div className="management-grid">{members.map((member) => {
      const isOwner = member.roles.some(({ role }) => role.key === "school-owner");
      const currentAssignableRole = member.roles.find(({ role }) => roles.some((option) => option.key === role.key))?.role.key ?? "teacher";
      return <article className="management-card" key={member.id}><div className="management-card-head"><span className="avatar-circle">{(member.user.name ?? member.user.email).slice(0, 2).toUpperCase()}</span><div><strong>{member.user.name ?? member.user.email}</strong><p>{member.user.email}</p></div><span className={`status-badge status-${member.status.toLowerCase()}`}>{member.status}</span></div><p>{member.roles.map(({ role }) => role.name).join(", ") || "Tanpa role"}</p><p>{member.homeroomAssignments.length > 0 ? `Wali kelas: ${member.homeroomAssignments.map((item) => item.classGroup.name).join(", ")}` : "Tidak ada penugasan wali kelas aktif"}</p>{canManage && !isOwner ? <div className="button-row"><ModalForm action={updateMemberRole} triggerLabel="Ubah role" triggerClassName="secondary-button" title={`Ubah role ${member.user.name ?? member.user.email}`} description="Role menentukan menu dan data yang dapat dikelola anggota." submitLabel="Simpan role"><input type="hidden" name="memberId" value={member.id} /><label>Role<select name="roleKey" defaultValue={currentAssignableRole}>{roles.map((role) => <option key={role.id} value={role.key}>{role.name}</option>)}</select></label></ModalForm><ConfirmAction action={updateMemberStatus} triggerLabel="Ubah status" title={`Ubah status akses ${member.user.name ?? member.user.email}?`} description="Status SUSPENDED menghentikan akses sementara. Status LEFT menandai anggota sudah keluar." confirmLabel="Simpan status"><input type="hidden" name="memberId" value={member.id} /><label>Status<select name="status" defaultValue={member.status === "INVITED" ? "ACTIVE" : member.status}><option value="ACTIVE">Aktif</option><option value="SUSPENDED">Ditangguhkan</option><option value="LEFT">Keluar</option></select></label></ConfirmAction></div> : null}</article>;
    })}</div>}</section> : <section className="panel section-panel"><div className="section-heading"><div><h2>Riwayat undangan</h2><p>{totalInvitations} undangan ditemukan.</p></div></div>{invitations.length === 0 ? <div className="empty-state"><strong>Belum ada undangan</strong><p>Undangan staf akan tampil di sini.</p></div> : <div className="management-grid">{invitations.map((invitation) => <article className="management-card" key={invitation.id}><div className="management-card-head"><div><strong>{invitation.email}</strong><p>Kedaluwarsa {invitation.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p></div><span className={`status-badge status-${invitation.status.toLowerCase()}`}>{invitation.status}</span></div>{canManage && invitation.status === "PENDING" ? <ConfirmAction action={revokeInvitation} triggerLabel="Cabut undangan" title={`Cabut undangan ${invitation.email}?`} description="Tautan undangan tidak dapat digunakan lagi setelah dicabut." confirmLabel="Ya, cabut"><input type="hidden" name="invitationId" value={invitation.id} /></ConfirmAction> : null}</article>)}</div>}</section>}

    {totalPages > 1 ? <nav className="pagination"><Link href={pageHref(Math.max(1, currentPage - 1))} className={currentPage === 1 ? "secondary-button is-disabled" : "secondary-button"}>Sebelumnya</Link><span>Halaman {currentPage} dari {totalPages}</span><Link href={pageHref(Math.min(totalPages, currentPage + 1))} className={currentPage === totalPages ? "secondary-button is-disabled" : "secondary-button"}>Berikutnya</Link></nav> : null}
  </div>;
}
