import Link from "next/link";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function daysUntil(value: Date | null) {
  if (!value) return null;
  return Math.ceil((value.getTime() - Date.now()) / 86_400_000);
}

export default async function PlatformDashboardPage() {
  const session = await auth();
  const now = new Date();
  const schools = await prisma.school.findMany({
    where: { deletedAt: null },
    include: {
      _count: { select: { students: true, members: true, auditLogs: true } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const userCount = await prisma.user.count({ where: { deletedAt: null } });

  const active = schools.filter((school) => school.status === "ACTIVE").length;
  const trial = schools.filter((school) => school.status === "TRIAL").length;
  const unhealthy = schools.filter((school) => ["PAST_DUE", "SUSPENDED", "CANCELLED"].includes(school.status)).length;
  const expiring = schools.filter((school) => {
    const end = school.status === "TRIAL" ? school.trialEndsAt : school.subscriptionEndsAt;
    const days = daysUntil(end);
    return days !== null && days >= 0 && days <= 14;
  }).length;

  const healthRows = schools.map((school) => {
    const end = school.status === "TRIAL" ? school.trialEndsAt : school.subscriptionEndsAt;
    const remaining = daysUntil(end);
    const studentUsage = school.studentLimit ? Math.round((school._count.students / school.studentLimit) * 100) : 0;
    const userUsage = school.userLimit ? Math.round((school._count.members / school.userLimit) * 100) : 0;
    const lastActivity = school.auditLogs[0]?.createdAt ?? school.createdAt;
    const inactiveDays = Math.floor((now.getTime() - lastActivity.getTime()) / 86_400_000);
    const risks = [
      ["PAST_DUE", "SUSPENDED", "CANCELLED"].includes(school.status) ? school.status : null,
      remaining !== null && remaining < 0 ? "EXPIRED" : null,
      remaining !== null && remaining >= 0 && remaining <= 14 ? `${remaining} hari tersisa` : null,
      studentUsage >= 90 ? `siswa ${studentUsage}%` : null,
      userUsage >= 90 ? `user ${userUsage}%` : null,
      inactiveDays >= 14 ? `${inactiveDays} hari tanpa aktivitas` : null,
    ].filter(Boolean);
    return { school, remaining, studentUsage, userUsage, inactiveDays, risks };
  }).sort((a, b) => b.risks.length - a.risks.length || b.studentUsage - a.studentUsage);

  return (
    <div className="admin-page">
      <header className="page-header"><div><span className="eyebrow">Platform Admin</span><h1>Kesehatan Tenant</h1><p>Selamat datang, {session?.user.name ?? session?.user.email}. Pantau adopsi, kapasitas, dan subscription seluruh sekolah.</p></div><Link href="/platform/schools/new" className="primary-button">Tambah sekolah</Link></header>
      <section className="stats-grid">
        <article><span>Total sekolah</span><strong>{schools.length}</strong></article>
        <article><span>Aktif</span><strong>{active}</strong></article>
        <article><span>Trial</span><strong>{trial}</strong></article>
        <article><span>Tenant bermasalah</span><strong>{unhealthy}</strong></article>
      </section>
      <section className="stats-grid">
        <article><span>Akan berakhir ≤14 hari</span><strong>{expiring}</strong></article>
        <article><span>Total pengguna</span><strong>{userCount}</strong></article>
        <article><span>Total siswa</span><strong>{schools.reduce((sum, school) => sum + school._count.students, 0)}</strong></article>
        <article><span>Audit event</span><strong>{schools.reduce((sum, school) => sum + school._count.auditLogs, 0)}</strong></article>
      </section>
      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Prioritas penanganan tenant</h2><p>Diurutkan berdasarkan jumlah indikator risiko.</p></div><Link href="/platform/schools" className="table-link">Kelola sekolah</Link></div>
        <div className="tenant-list">{healthRows.map(({ school, studentUsage, userUsage, inactiveDays, risks }) => <Link href={`/platform/schools/${school.id}`} key={school.id} className="tenant-row"><div><strong>{school.name}</strong><span>{school.code} · {school.status}</span><span>Siswa {school._count.students}/{school.studentLimit} ({studentUsage}%) · User {school._count.members}/{school.userLimit} ({userUsage}%) · Aktivitas terakhir {inactiveDays} hari lalu</span><span>{risks.length ? `Risiko: ${risks.join(" · ")}` : "Sehat"}</span></div><span className={`status-badge status-${school.status.toLowerCase()}`}>{risks.length} indikator</span></Link>)}</div>
      </section>
    </div>
  );
}
