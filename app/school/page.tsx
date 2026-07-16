import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export default async function SchoolDashboardPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId || session.user.guardianId) redirect("/login");
  const schoolId = session.user.schoolId;
  const now = new Date();
  const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart); todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  const [school, activeStudents, activeMembers, attendanceToday, openInvoices, overdueInvoices, auditCount, recentAudits, activeAnnouncements] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, include: { members: { where: { userId: session.user.id }, include: { roles: { include: { role: true } } } } } }),
    prisma.student.count({ where: { schoolId, deletedAt: null, status: "ACTIVE" } }),
    prisma.schoolMember.count({ where: { schoolId, deletedAt: null, status: "ACTIVE" } }),
    prisma.attendanceSession.count({ where: { schoolId, date: { gte: todayStart, lt: todayEnd } } }),
    prisma.invoice.findMany({ where: { schoolId, status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, select: { totalAmount: true, paidAmount: true, dueDate: true } }),
    prisma.invoice.findMany({ where: { schoolId, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: now } }, select: { totalAmount: true, paidAmount: true } }),
    prisma.auditLog.count({ where: { schoolId } }),
    prisma.auditLog.findMany({ where: { schoolId }, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "Announcement" WHERE "schoolId"=${schoolId} AND "status"='PUBLISHED' AND ("publishAt" IS NULL OR "publishAt"<=NOW()) AND ("expiresAt" IS NULL OR "expiresAt">NOW())`,
  ]);
  if (!school) redirect("/login");

  const roles = school.members[0]?.roles.map((item) => item.role.name).join(", ") || "Tanpa role";
  const outstanding = openInvoices.reduce((sum, item) => sum + Number(item.totalAmount.minus(item.paidAmount)), 0);
  const overdue = overdueInvoices.reduce((sum, item) => sum + Number(item.totalAmount.minus(item.paidAmount)), 0);
  const studentUsage = school.studentLimit ? Math.round((activeStudents / school.studentLimit) * 100) : 0;
  const userUsage = school.userLimit ? Math.round((activeMembers / school.userLimit) * 100) : 0;

  return (
    <div className="admin-page">
      <header className="page-header"><div><span className="eyebrow">Dashboard sekolah</span><h1>{school.name}</h1><p>Selamat datang, {session.user.name ?? session.user.email}. Role: {roles}.</p></div><Link href="/school/audit" className="secondary-button">Buka Audit Log</Link></header>
      <section className="stats-grid">
        <article><span>Siswa aktif</span><strong>{activeStudents}</strong><p>{studentUsage}% dari batas {school.studentLimit}</p></article>
        <article><span>Anggota aktif</span><strong>{activeMembers}</strong><p>{userUsage}% dari batas {school.userLimit}</p></article>
        <article><span>Absensi hari ini</span><strong>{attendanceToday}</strong><p>sesi rombel tercatat</p></article>
        <article><span>Pengumuman aktif</span><strong>{Number(activeAnnouncements[0]?.count ?? 0)}</strong></article>
      </section>
      <section className="stats-grid">
        <article><span>Saldo tagihan</span><strong>{rupiah(outstanding)}</strong></article>
        <article><span>Tunggakan</span><strong>{rupiah(overdue)}</strong></article>
        <article><span>Status tenant</span><strong>{school.status}</strong></article>
        <article><span>Total audit event</span><strong>{auditCount}</strong></article>
      </section>
      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Aktivitas terbaru</h2><p>Perubahan data dan akses terakhir di sekolah.</p></div><Link href="/school/audit" className="table-link">Lihat semua</Link></div>
        <div className="tenant-list">{recentAudits.map((log) => <article className="tenant-row" key={log.id}><div><strong>{log.action}</strong><span>{log.entityType} · {log.actor?.name ?? log.actor?.email ?? "SYSTEM"}</span><span>{log.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</span></div></article>)}</div>
      </section>
    </div>
  );
}
