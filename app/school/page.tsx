import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function SchoolDashboardPage() {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");

  const school = await prisma.school.findUnique({
    where: { id: session.user.schoolId },
    include: {
      _count: { select: { members: true, roles: true, invitations: true, auditLogs: true } },
      members: {
        where: { userId: session.user.id },
        include: { roles: { include: { role: true } } },
      },
    },
  });
  if (!school) redirect("/login");

  const roles = school.members[0]?.roles.map((item) => item.role.name).join(", ") || "Tanpa role";

  return (
    <div className="admin-page">
      <header className="page-header">
        <div><span className="eyebrow">Dashboard sekolah</span><h1>{school.name}</h1><p>Selamat datang, {session.user.name ?? session.user.email}. Role: {roles}.</p></div>
      </header>
      <section className="stats-grid">
        <article><span>Status tenant</span><strong>{school.status}</strong></article>
        <article><span>Anggota</span><strong>{school._count.members}</strong></article>
        <article><span>Role tersedia</span><strong>{school._count.roles}</strong></article>
        <article><span>Audit event</span><strong>{school._count.auditLogs}</strong></article>
      </section>
      <section className="panel section-panel">
        <h2>Workspace siap digunakan</h2>
        <p>Fondasi tenant, role, permission, dan akses School Owner sudah aktif. Modul berikutnya adalah tahun ajaran, semester, kelas, siswa, dan wali.</p>
      </section>
    </div>
  );
}
