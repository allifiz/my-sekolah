import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function formatValue(value: unknown) {
  if (value == null) return "—";
  const text = JSON.stringify(value);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

export default async function SchoolAuditPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId || session.user.guardianId) redirect("/login");

  const member = await prisma.schoolMember.findFirst({
    where: {
      schoolId: session.user.schoolId,
      userId: session.user.id,
      status: "ACTIVE",
      deletedAt: null,
      roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal"] } } } },
    },
    select: { id: true },
  });
  if (!member) redirect("/school?error=forbidden");

  const { action } = await searchParams;
  const logs = await prisma.auditLog.findMany({
    where: { schoolId: session.user.schoolId, ...(action ? { action: { contains: action, mode: "insensitive" } } : {}) },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="admin-page">
      <header className="page-header"><div><span className="eyebrow">Operational visibility</span><h1>Audit Log Sekolah</h1><p>200 aktivitas terbaru yang mengubah data dan akses tenant.</p></div></header>
      <section className="panel section-panel">
        <form className="admin-form" method="get"><label>Cari action<input name="action" defaultValue={action ?? ""} placeholder="invoice, attendance, member..." /></label><button className="secondary-button" type="submit">Filter</button></form>
      </section>
      <section className="panel section-panel">
        {logs.length === 0 ? <p>Belum ada audit event yang cocok.</p> : <div className="tenant-list">{logs.map((log) => <article className="tenant-row" key={log.id}><div><strong>{log.action}</strong><span>{log.entityType}{log.entityId ? ` · ${log.entityId}` : ""}</span><span>{log.actor?.name ?? log.actor?.email ?? "SYSTEM"} · {log.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</span>{log.reason ? <span>Alasan: {log.reason}</span> : null}<span>{formatValue(log.newValue ?? log.metadata ?? log.oldValue)}</span></div></article>)}</div>}
      </section>
    </div>
  );
}
