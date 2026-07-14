import Link from "next/link";
import { prisma } from "@/lib/prisma";

const statusLabel: Record<string, string> = {
  TRIAL: "Trial",
  ACTIVE: "Aktif",
  PAST_DUE: "Past due",
  SUSPENDED: "Ditangguhkan",
  CANCELLED: "Dibatalkan",
  ARCHIVED: "Diarsipkan",
};

export default async function SchoolsPage() {
  const schools = await prisma.school.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { members: true } } },
  });

  return (
    <div className="admin-page">
      <header className="page-header">
        <div><span className="eyebrow">Tenant management</span><h1>Sekolah</h1><p>Kelola tenant, kapasitas, trial, dan status operasional.</p></div>
        <Link href="/platform/schools/new" className="primary-button">Tambah sekolah</Link>
      </header>

      <section className="panel table-panel">
        {schools.length === 0 ? (
          <div className="empty-state"><h2>Belum ada sekolah</h2><p>Buat tenant pertama untuk memulai onboarding.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Sekolah</th><th>Status</th><th>Anggota</th><th>Limit siswa</th><th>Trial berakhir</th><th /></tr></thead>
              <tbody>
                {schools.map((school) => (
                  <tr key={school.id}>
                    <td><strong>{school.name}</strong><small>{school.code} · {school.slug}</small></td>
                    <td><span className={`status-badge status-${school.status.toLowerCase()}`}>{statusLabel[school.status]}</span></td>
                    <td>{school._count.members}</td>
                    <td>{school.studentLimit.toLocaleString("id-ID")}</td>
                    <td>{school.trialEndsAt ? school.trialEndsAt.toLocaleDateString("id-ID") : "—"}</td>
                    <td><Link href={`/platform/schools/${school.id}`} className="table-link">Detail</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
