import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

function rupiah(value: { toString(): string } | number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value.toString()));
}

const attendanceLabels: Record<string, string> = { PRESENT: "Hadir", SICK: "Sakit", EXCUSED: "Izin", ABSENT: "Alpa", LATE: "Terlambat" };

export default async function GuardianPortalPage({ searchParams }: { searchParams: Promise<{ studentId?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.guardianId || !session.user.schoolId) redirect("/login");
  const params = await searchParams;
  const guardian = await prisma.guardian.findFirst({
    where: { id: session.user.guardianId, schoolId: session.user.schoolId, deletedAt: null },
    include: { students: { include: { student: { include: { enrollments: { where: { status: "ACTIVE" }, include: { classGroup: { include: { gradeLevel: true, academicYear: true } } }, take: 1 } } } } } },
  });
  if (!guardian) redirect("/login?error=no-access");
  const children = guardian.students.map((link) => link.student).filter((student) => !student.deletedAt);
  const selected = children.find((student) => student.id === params.studentId) ?? children[0];
  if (!selected) return <main className="auth-shell"><section className="auth-panel"><div className="auth-card"><h2>Portal Wali</h2><p>Belum ada siswa yang terhubung ke akun ini.</p></div></section></main>;
  const enrollment = selected.enrollments[0];
  const [attendance, invoices, announcements] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { schoolId: session.user.schoolId, studentId: selected.id }, include: { session: true }, orderBy: { session: { date: "desc" } }, take: 12 }),
    prisma.invoice.findMany({ where: { schoolId: session.user.schoolId, studentId: selected.id, status: { not: "VOID" } }, include: { allocations: { include: { payment: true } } }, orderBy: { issueDate: "desc" }, take: 12 }),
    prisma.$queryRaw<Array<{ id: string; title: string; content: string; publishAt: Date | null; audience: string }>>`SELECT "id","title","content","publishAt","audience"::text FROM "Announcement" WHERE "schoolId"=${session.user.schoolId} AND "status"='PUBLISHED' AND ("publishAt" IS NULL OR "publishAt"<=NOW()) AND ("expiresAt" IS NULL OR "expiresAt">NOW()) AND ("audience"='SCHOOL' OR "classGroupId"=${enrollment?.classGroupId ?? ""}) ORDER BY COALESCE("publishAt","createdAt") DESC LIMIT 12`,
  ]);
  const totals = attendance.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }), {} as Record<string, number>);
  const outstanding = invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount.minus(invoice.paidAmount)), 0);

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Link href="/guardian" className="admin-brand"><span className="brand-mark">PW</span><span><strong>{guardian.name}</strong><small>Portal Wali</small></span></Link>
        <span className="sidebar-group-label">Pilih anak</span>
        <div className="guardian-tabs">{children.map((child) => <Link className={child.id === selected.id ? "guardian-tab is-active" : "guardian-tab"} key={child.id} href={`/guardian?studentId=${child.id}`}>{child.name}</Link>)}</div>
        <div className="admin-account"><strong>{session.user.email}</strong><small>Akun wali aktif</small><Link href="/account/security" className="table-link">Keamanan akun</Link></div>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}><button className="secondary-button" type="submit">Keluar</button></form>
      </aside>
      <main className="admin-content">
        <div className="admin-page">
          <section className="dashboard-hero"><div className="dashboard-hero-inner"><div><span className="eyebrow">Ringkasan anak</span><h1>{selected.name}</h1><p>NIS {selected.nis} · {enrollment ? `${enrollment.classGroup.gradeLevel.name} · ${enrollment.classGroup.name} · ${enrollment.classGroup.academicYear.name}` : "Belum ada kelas aktif"}</p></div></div></section>
          <section className="metric-grid"><article className="metric-card success"><span>Hadir</span><strong>{totals.PRESENT ?? 0}</strong><small>dari 12 catatan terakhir</small></article><article className="metric-card"><span>Izin/Sakit</span><strong>{(totals.EXCUSED ?? 0) + (totals.SICK ?? 0)}</strong><small>catatan terbaru</small></article><article className="metric-card warning"><span>Alpa</span><strong>{totals.ABSENT ?? 0}</strong><small>perlu perhatian</small></article><article className="metric-card accent"><span>Sisa tagihan</span><strong>{rupiah(outstanding)}</strong><small>belum dibayar</small></article></section>

          <section className="panel section-panel guardian-section"><div className="section-heading"><div><h2>Absensi terbaru</h2><p>Riwayat kehadiran paling baru.</p></div></div>{attendance.length ? <div className="guardian-card-grid">{attendance.map((item) => <article className="guardian-card" key={item.id}><span>{item.session.date.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</span><strong>{attendanceLabels[item.status]}</strong><p>{item.note ?? "Tanpa catatan"}</p></article>)}</div> : <div className="empty-state">Belum ada data absensi.</div>}</section>
          <section className="panel section-panel guardian-section"><div className="section-heading"><div><h2>Tagihan dan pembayaran</h2><p>Status kewajiban dan kuitansi terbaru.</p></div></div>{invoices.length ? <div className="guardian-card-grid">{invoices.map((invoice) => <article className="guardian-card" key={invoice.id}><span>{invoice.number} · {invoice.status}</span><strong>{invoice.title}</strong><p>Total {rupiah(invoice.totalAmount)}<br />Dibayar {rupiah(invoice.paidAmount)}<br />Sisa {rupiah(invoice.totalAmount.minus(invoice.paidAmount))}</p><p>Jatuh tempo {invoice.dueDate.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</p></article>)}</div> : <div className="empty-state">Belum ada tagihan.</div>}</section>
          <section className="panel section-panel guardian-section"><div className="section-heading"><div><h2>Pengumuman</h2><p>Informasi terbaru dari sekolah dan rombel.</p></div></div>{announcements.length ? <div className="guardian-card-grid">{announcements.map((item) => <article className="guardian-card" key={item.id}><span>{item.audience === "SCHOOL" ? "Sekolah" : "Rombel"}</span><strong>{item.title}</strong><p style={{ whiteSpace: "pre-wrap" }}>{item.content}</p></article>)}</div> : <div className="empty-state">Belum ada pengumuman aktif.</div>}</section>
        </div>
      </main>
    </div>
  );
}
