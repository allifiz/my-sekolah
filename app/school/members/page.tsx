import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { inviteStaff, revokeInvitation, updateMemberStatus } from "./actions";

const errors: Record<string, string> = {
  "invalid-invitation": "Data undangan belum valid.",
  "reference-not-found": "Role atau sekolah tidak ditemukan.",
  "user-limit": "Batas pengguna sekolah sudah tercapai.",
  "duplicate-invitation": "Email tersebut masih memiliki undangan aktif.",
  "already-member": "Email tersebut sudah menjadi anggota sekolah.",
  "invitation-not-found": "Undangan tidak ditemukan atau sudah tidak aktif.",
  "invalid-member": "Perubahan status anggota tidak valid.",
  "member-not-found": "Anggota tidak ditemukan.",
  "last-owner": "School Owner aktif terakhir tidak boleh dinonaktifkan.",
};

export default async function SchoolMembersPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; delivery?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const params = await searchParams;
  const actor = await prisma.schoolMember.findFirst({
    where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null },
    include: { roles: { include: { role: true } } },
  });
  if (!actor) redirect("/school?error=forbidden");
  const canManage = actor.roles.some(({ role }) => ["school-owner", "school-admin"].includes(role.key));

  const [school, members, invitations, roles] = await Promise.all([
    prisma.school.findUnique({ where: { id: session.user.schoolId }, select: { userLimit: true } }),
    prisma.schoolMember.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      include: { user: true, roles: { include: { role: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({ where: { schoolId: session.user.schoolId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.role.findMany({ where: { schoolId: session.user.schoolId, key: { in: ["school-admin", "principal", "finance", "teacher", "homeroom-teacher"] } }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="admin-page">
      <header className="page-header"><div><span className="eyebrow">Akses sekolah</span><h1>Anggota dan Undangan</h1><p>Kelola staf, role awal, status akses, dan batas pengguna sekolah.</p></div></header>
      {params.error ? <section className="panel section-panel"><strong>Gagal:</strong> {errors[params.error] ?? "Terjadi kesalahan."}</section> : null}
      {params.success ? <section className="panel section-panel"><strong>Berhasil:</strong> Data anggota sudah diperbarui.{params.delivery === "pending" ? " Email belum terkirim karena layanan email belum tersedia." : ""}</section> : null}

      <section className="stats-grid">
        <article><span>Pengguna aktif</span><strong>{members.filter((item) => item.status === "ACTIVE").length}</strong></article>
        <article><span>Batas paket</span><strong>{school?.userLimit ?? 0}</strong></article>
        <article><span>Undangan aktif</span><strong>{invitations.filter((item) => item.status === "PENDING" && item.expiresAt > new Date()).length}</strong></article>
      </section>

      {canManage ? <section className="panel section-panel">
        <h2>Undang Staf</h2>
        <form action={inviteStaff} className="admin-form">
          <label>Email<input name="email" type="email" required /></label>
          <label>Role<select name="roleKey" required defaultValue="teacher">{roles.map((role) => <option key={role.id} value={role.key}>{role.name}</option>)}</select></label>
          <button className="primary-button" type="submit">Kirim Undangan</button>
        </form>
      </section> : null}

      <section className="panel section-panel">
        <h2>Anggota</h2>
        {members.length === 0 ? <p>Belum ada anggota.</p> : <div className="stats-grid">{members.map((member) => (
          <article key={member.id}>
            <span>{member.roles.map(({ role }) => role.name).join(", ") || "Tanpa role"}</span>
            <strong>{member.user.name ?? member.user.email}</strong>
            <p>{member.user.email}</p><p>Status: {member.status}</p>
            {canManage ? <form action={updateMemberStatus} className="admin-form">
              <input type="hidden" name="memberId" value={member.id} />
              <select name="status" defaultValue={member.status === "INVITED" ? "ACTIVE" : member.status}><option value="ACTIVE">Aktif</option><option value="SUSPENDED">Ditangguhkan</option><option value="LEFT">Keluar</option></select>
              <button className="secondary-button" type="submit">Perbarui</button>
            </form> : null}
          </article>
        ))}</div>}
      </section>

      <section className="panel section-panel">
        <h2>Riwayat Undangan</h2>
        {invitations.length === 0 ? <p>Belum ada undangan.</p> : <div className="stats-grid">{invitations.map((invitation) => (
          <article key={invitation.id}><span>{invitation.status}</span><strong>{invitation.email}</strong><p>Kedaluwarsa {invitation.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p>
            {canManage && invitation.status === "PENDING" ? <form action={revokeInvitation}><input type="hidden" name="invitationId" value={invitation.id} /><button className="secondary-button" type="submit">Cabut Undangan</button></form> : null}
          </article>
        ))}</div>}
      </section>
    </div>
  );
}
