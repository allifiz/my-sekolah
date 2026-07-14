import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { changeSchoolStatus } from "../actions";

export default async function SchoolDetailPage({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = await params;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: {
      _count: { select: { members: true, auditLogs: true } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 12, include: { actor: { select: { name: true, email: true } } } },
    },
  });
  if (!school) notFound();

  return (
    <div className="admin-page">
      <header className="page-header">
        <div><span className="eyebrow">Tenant detail</span><h1>{school.name}</h1><p>{school.code} · {school.slug}</p></div>
        <Link href="/platform/schools" className="secondary-button">Kembali</Link>
      </header>

      <section className="detail-grid">
        <article className="panel detail-card"><span>Status</span><strong>{school.status}</strong><small>{school.trialEndsAt ? `Trial sampai ${school.trialEndsAt.toLocaleDateString("id-ID")}` : "Tanpa trial aktif"}</small></article>
        <article className="panel detail-card"><span>Anggota</span><strong>{school._count.members}</strong><small>Limit {school.userLimit} pengguna</small></article>
        <article className="panel detail-card"><span>Kapasitas siswa</span><strong>{school.studentLimit.toLocaleString("id-ID")}</strong><small>Batas paket saat ini</small></article>
        <article className="panel detail-card"><span>Audit event</span><strong>{school._count.auditLogs}</strong><small>Riwayat aksi tercatat</small></article>
      </section>

      <section className="content-grid">
        <article className="panel section-panel">
          <h2>Profil tenant</h2>
          <dl className="definition-list">
            <div><dt>Email</dt><dd>{school.email ?? "—"}</dd></div>
            <div><dt>Telepon</dt><dd>{school.phone ?? "—"}</dd></div>
            <div><dt>Timezone</dt><dd>{school.timezone}</dd></div>
            <div><dt>Dibuat</dt><dd>{school.createdAt.toLocaleString("id-ID")}</dd></div>
          </dl>
        </article>

        <article className="panel section-panel">
          <h2>Ubah status</h2>
          <form action={changeSchoolStatus} className="stack-form">
            <input type="hidden" name="schoolId" value={school.id} />
            <label className="field"><span>Status baru</span><select name="status" defaultValue={school.status}><option value="TRIAL">Trial</option><option value="ACTIVE">Aktif</option><option value="PAST_DUE">Past due</option><option value="SUSPENDED">Ditangguhkan</option><option value="CANCELLED">Dibatalkan</option><option value="ARCHIVED">Diarsipkan</option></select></label>
            <label className="field"><span>Alasan perubahan</span><textarea name="reason" required minLength={3} rows={3} placeholder="Jelaskan alasan perubahan status" /></label>
            <button className="primary-button" type="submit">Simpan status</button>
          </form>
        </article>
      </section>

      <section className="panel section-panel">
        <h2>Audit log terbaru</h2>
        <div className="audit-list">
          {school.auditLogs.map((log) => <div key={log.id} className="audit-item"><div><strong>{log.action}</strong><span>{log.reason ?? log.entityType}</span></div><div><span>{log.actor?.name ?? log.actor?.email ?? "System"}</span><time>{log.createdAt.toLocaleString("id-ID")}</time></div></div>)}
        </div>
      </section>
    </div>
  );
}
