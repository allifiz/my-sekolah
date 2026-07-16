import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FlashMessage } from "@/components/flash-message";
import { prisma } from "@/lib/prisma";

import { inviteStaff, revokeInvitation, updateMemberRole, updateMemberStatus } from "./actions";

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

export default async function SchoolMembersPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; delivery?: string; q?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const actor = await prisma.schoolMember.findFirst({
    where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null },
    include: { roles: { include: { role: true } } },
  });
  if (!actor) redirect("/school?error=forbidden");
  const canManage = actor.roles.some(({ role }) => ["school-owner", "school-admin"].includes(role.key));

  const [school, members, invitations, roles] = await Promise.all([
    prisma.school.findUnique({ where: { id: session.user.schoolId }, select: { userLimit: true } }),
    prisma.schoolMember.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null, ...(query ? { user: { OR: [{ name: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] } } : {}) },
      include: { user: true, roles: { include: { role: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({ where: { schoolId: session.user.schoolId, ...(query ? { email: { contains: query, mode: "insensitive" } } : {}) }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.role.findMany({ where: { schoolId: session.user.schoolId, key: { in: ["school-admin", "principal", "finance", "teacher", "homeroom-teacher"] } }, orderBy: { name: "asc" } }),
  ]);

  const activeCount = members.filter((item) => item.status === "ACTIVE").length;
  const pendingCount = invitations.filter((item) => item.status === "PENDING" && item.expiresAt > new Date()).length;

  return (
    <div className="admin-page">
      <header className="page-header"><div><span className="eyebrow">Akses sekolah</span><h1>Anggota dan Undangan</h1><p>Kelola staf, role, status akses, dan batas pengguna sekolah.</p></div></header>
      {params.error ? <FlashMessage tone="error" title="Perubahan gagal" message={errors[params.error] ?? "Terjadi kesalahan."} /> : null}
      {params.success ? <FlashMessage tone={params.delivery === "pending" ? "info" : "success"} title="Data diperbarui" message={params.delivery === "pending" ? "Undangan tersimpan, tetapi email belum terkirim karena layanan email belum tersedia." : "Perubahan anggota berhasil disimpan."} /> : null}

      <section className="stats-grid">
        <article><span>Pengguna aktif</span><strong>{activeCount}</strong></article>
        <article><span>Batas paket</span><strong>{school?.userLimit ?? 0}</strong></article>
        <article><span>Undangan aktif</span><strong>{pendingCount}</strong></article>
        <article><span>Sisa kapasitas</span><strong>{Math.max((school?.userLimit ?? 0) - activeCount, 0)}</strong></article>
      </section>

      <section className="panel section-panel toolbar-panel">
        <form className="search-toolbar" method="get"><label><span className="sr-only">Cari anggota atau undangan</span><input name="q" defaultValue={query} placeholder="Cari nama atau email..." /></label><button className="secondary-button" type="submit">Cari</button>{query ? <a className="text-button" href="/school/members">Reset</a> : null}</form>
      </section>

      {canManage ? <section className="panel section-panel form-panel">
        <div className="section-heading"><div><h2>Undang Staf</h2><p>Kirim akses dengan role awal yang dapat diubah setelah staf aktif.</p></div></div>
        <form action={inviteStaff} className="admin-form form-grid">
          <label>Email<input name="email" type="email" required /></label>
          <label>Role<select name="roleKey" required defaultValue="teacher">{roles.map((role) => <option key={role.id} value={role.key}>{role.name}</option>)}</select></label>
          <div className="form-actions field-wide"><button className="primary-button" type="submit">Kirim Undangan</button></div>
        </form>
      </section> : null}

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Anggota</h2><p>{members.length} anggota ditemukan.</p></div></div>
        {members.length === 0 ? <div className="empty-state"><strong>Tidak ada anggota yang cocok</strong><p>Ubah kata pencarian atau kirim undangan staf baru.</p></div> : <div className="management-grid">{members.map((member) => {
          const isOwner = member.roles.some(({ role }) => role.key === "school-owner");
          const currentAssignableRole = member.roles.find(({ role }) => roles.some((option) => option.key === role.key))?.role.key ?? "teacher";
          return (
            <article className="management-card" key={member.id}>
              <div className="management-card-head"><span className="avatar-circle">{(member.user.name ?? member.user.email).slice(0, 2).toUpperCase()}</span><div><strong>{member.user.name ?? member.user.email}</strong><p>{member.user.email}</p></div><span className={`status-badge status-${member.status.toLowerCase()}`}>{member.status}</span></div>
              <p>{member.roles.map(({ role }) => role.name).join(", ") || "Tanpa role"}</p>
              {canManage && !isOwner ? <form action={updateMemberRole} className="inline-management-form"><input type="hidden" name="memberId" value={member.id} /><select aria-label={`Role ${member.user.name ?? member.user.email}`} name="roleKey" defaultValue={currentAssignableRole}>{roles.map((role) => <option key={role.id} value={role.key}>{role.name}</option>)}</select><button className="secondary-button" type="submit">Ubah Role</button></form> : null}
              {canManage ? <form action={updateMemberStatus} className="inline-management-form"><input type="hidden" name="memberId" value={member.id} /><select aria-label={`Status ${member.user.name ?? member.user.email}`} name="status" defaultValue={member.status === "INVITED" ? "ACTIVE" : member.status}><option value="ACTIVE">Aktif</option><option value="SUSPENDED">Ditangguhkan</option><option value="LEFT">Keluar</option></select><button className="secondary-button" type="submit">Simpan Status</button></form> : null}
            </article>
          );
        })}</div>}
      </section>

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Riwayat Undangan</h2><p>Status undangan terbaru untuk staf sekolah.</p></div></div>
        {invitations.length === 0 ? <div className="empty-state"><strong>Belum ada undangan</strong><p>Undangan baru akan tampil di sini.</p></div> : <div className="management-grid">{invitations.map((invitation) => (
          <article className="management-card" key={invitation.id}><div className="management-card-head"><div><strong>{invitation.email}</strong><p>Kedaluwarsa {invitation.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p></div><span className={`status-badge status-${invitation.status.toLowerCase()}`}>{invitation.status}</span></div>
            {canManage && invitation.status === "PENDING" ? <form action={revokeInvitation}><input type="hidden" name="invitationId" value={invitation.id} /><button className="secondary-button" type="submit">Cabut Undangan</button></form> : null}
          </article>
        ))}</div>}
      </section>
    </div>
  );
}
