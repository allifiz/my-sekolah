import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function formatValue(value: unknown) {
  if (value == null) return "—";
  const text = JSON.stringify(value);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

const PAGE_SIZE = 30;

export default async function SchoolAuditPage({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string; page?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId || session.user.guardianId) redirect("/login");

  const member = await prisma.schoolMember.findFirst({
    where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal"] } } } } },
    select: { id: true },
  });
  if (!member) redirect("/school?error=forbidden");

  const params = await searchParams;
  const action = params.action?.trim() ?? "";
  const entity = params.entity?.trim() ?? "";
  const page = Math.max(Number.parseInt(params.page ?? "1", 10) || 1, 1);
  const where = {
    schoolId: session.user.schoolId,
    ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
    ...(entity ? { entityType: { contains: entity, mode: "insensitive" as const } } : {}),
  };
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.auditLog.count({ where }),
  ]);
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const queryString = new URLSearchParams({ ...(action ? { action } : {}), ...(entity ? { entity } : {}) });

  return (
    <div className="admin-page">
      <header className="page-header"><div><span className="eyebrow">Operational visibility</span><h1>Audit Log Sekolah</h1><p>Telusuri perubahan data dan akses tenant dengan filter yang lebih terarah.</p></div></header>
      <section className="stats-grid">
        <article><span>Event ditemukan</span><strong>{total}</strong></article>
        <article><span>Halaman</span><strong>{page}/{pageCount}</strong></article>
        <article><span>Filter action</span><strong>{action || "Semua"}</strong></article>
        <article><span>Filter entitas</span><strong>{entity || "Semua"}</strong></article>
      </section>
      <section className="panel section-panel toolbar-panel">
        <form className="filter-toolbar" method="get">
          <label>Action<input name="action" defaultValue={action} placeholder="invoice, attendance, member..." /></label>
          <label>Entitas<input name="entity" defaultValue={entity} placeholder="Student, Invoice, SchoolMember..." /></label>
          <button className="secondary-button" type="submit">Terapkan Filter</button>
          {action || entity ? <Link className="text-button" href="/school/audit">Reset</Link> : null}
        </form>
      </section>
      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Aktivitas</h2><p>Menampilkan maksimal {PAGE_SIZE} event per halaman.</p></div></div>
        {logs.length === 0 ? <div className="empty-state"><strong>Tidak ada audit event yang cocok</strong><p>Ubah filter action atau entitas untuk memperluas hasil.</p></div> : <div className="audit-timeline">{logs.map((log) => <article className="audit-event" key={log.id}><span className="audit-dot" aria-hidden="true" /><div><div className="audit-event-head"><strong>{log.action}</strong><time>{log.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</time></div><p>{log.entityType}{log.entityId ? ` · ${log.entityId}` : ""}</p><p>{log.actor?.name ?? log.actor?.email ?? "SYSTEM"}{log.reason ? ` · Alasan: ${log.reason}` : ""}</p><code>{formatValue(log.newValue ?? log.metadata ?? log.oldValue)}</code></div></article>)}</div>}
        {pageCount > 1 ? <nav className="pagination" aria-label="Pagination audit log"><Link aria-disabled={page <= 1} className={page <= 1 ? "secondary-button is-disabled" : "secondary-button"} href={`/school/audit?${queryString.toString()}${queryString.size ? "&" : ""}page=${Math.max(page - 1, 1)}`}>Sebelumnya</Link><span>Halaman {page} dari {pageCount}</span><Link aria-disabled={page >= pageCount} className={page >= pageCount ? "secondary-button is-disabled" : "secondary-button"} href={`/school/audit?${queryString.toString()}${queryString.size ? "&" : ""}page=${Math.min(page + 1, pageCount)}`}>Berikutnya</Link></nav> : null}
      </section>
    </div>
  );
}
