import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function PlatformDashboardPage() {
  const [session, schoolCount, activeSchoolCount, userCount, recentSchools] = await Promise.all([
    auth(),
    prisma.school.count({ where: { deletedAt: null } }),
    prisma.school.count({ where: { status: "ACTIVE", deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.school.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  return (
    <div className="admin-page">
      <header className="page-header">
        <div><span className="eyebrow">Platform Admin</span><h1>Ringkasan</h1><p>Selamat datang, {session?.user.name ?? session?.user.email}.</p></div>
        <Link href="/platform/schools/new" className="primary-button">Tambah sekolah</Link>
      </header>

      <section className="stats-grid">
        <article><span>Total sekolah</span><strong>{schoolCount}</strong></article>
        <article><span>Sekolah aktif</span><strong>{activeSchoolCount}</strong></article>
        <article><span>Total pengguna</span><strong>{userCount}</strong></article>
        <article><span>Role platform</span><strong>{session?.user.platformRole}</strong></article>
      </section>

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Tenant terbaru</h2><p>Sekolah yang paling baru masuk ke platform.</p></div><Link href="/platform/schools" className="table-link">Lihat semua</Link></div>
        <div className="tenant-list">
          {recentSchools.map((school) => <Link href={`/platform/schools/${school.id}`} key={school.id} className="tenant-row"><div><strong>{school.name}</strong><span>{school.code} · {school.slug}</span></div><span className={`status-badge status-${school.status.toLowerCase()}`}>{school.status}</span></Link>)}
        </div>
      </section>
    </div>
  );
}
