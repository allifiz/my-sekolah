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
  if (!selected) return <main className="auth-shell"><section className="auth-card"><h1>Portal Wali</h1><p>Belum ada siswa yang terhubung ke akun ini.</p></section></main>;
  const enrollment = selected.enrollments[0];
  const [attendance, invoices, announcements] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { schoolId: session.user.schoolId, studentId: selected.id }, include: { session: true }, orderBy: { session: { date: "desc" } }, take: 31 }),
    prisma.invoice.findMany({ where: { schoolId: session.user.schoolId, studentId: selected.id, status: { not: "VOID" } }, include: { allocations: { include: { payment: true } } }, orderBy: { issueDate: "desc" }, take: 30 }),
    prisma.$queryRaw<Array<{ id: string; title: string; content: string; publishAt: Date | null; audience: string }>>`SELECT "id","title","content","publishAt","audience"::text FROM "Announcement" WHERE "schoolId"=${session.user.schoolId} AND "status"='PUBLISHED' AND ("publishAt" IS NULL OR "publishAt"<=NOW()) AND ("expiresAt" IS NULL OR "expiresAt">NOW()) AND ("audience"='SCHOOL' OR "classGroupId"=${enrollment?.classGroupId ?? ""}) ORDER BY COALESCE("publishAt","createdAt") DESC LIMIT 20`,
  ]);
  const totals = attendance.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }), {} as Record<string, number>);
  const outstanding = invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount.minus(invoice.paidAmount)), 0);
  return <div className="admin-layout"><aside className="admin-sidebar"><div><span className="eyebrow">Portal Wali</span><h2>{guardian.name}</h2><p>{session.user.email}</p></div><nav className="admin-nav">{children.map((child) => <a key={child.id} href={`/guardian?studentId=${child.id}`}>{child.name}</a>)}</nav><form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}><button className="secondary-button" type="submit">Keluar</button></form></aside><main className="admin-content"><div className="admin-page"><header className="page-header"><div><span className="eyebrow">Ringkasan anak</span><h1>{selected.name}</h1><p>NIS {selected.nis} · {enrollment ? `${enrollment.classGroup.gradeLevel.name} · ${enrollment.classGroup.name} · ${enrollment.classGroup.academicYear.name}` : "Belum ada kelas aktif"}</p></div></header>
  <section className="stats-grid"><article><span>Hadir</span><strong>{totals.PRESENT ?? 0}</strong></article><article><span>Izin/Sakit</span><strong>{(totals.EXCUSED ?? 0) + (totals.SICK ?? 0)}</strong></article><article><span>Alpa</span><strong>{totals.ABSENT ?? 0}</strong></article><article><span>Sisa tagihan</span><strong>{rupiah(outstanding)}</strong></article></section>
  <section className="panel section-panel"><h2>Absensi Terbaru</h2>{attendance.length ? <div className="stats-grid">{attendance.map((item) => <article key={item.id}><span>{item.session.date.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</span><strong>{attendanceLabels[item.status]}</strong><p>{item.note ?? "Tanpa catatan"}</p></article>)}</div> : <p>Belum ada data absensi.</p>}</section>
  <section className="panel section-panel"><h2>Tagihan dan Pembayaran</h2>{invoices.length ? <div className="stats-grid">{invoices.map((invoice) => <article key={invoice.id}><span>{invoice.number} · {invoice.status}</span><strong>{invoice.title}</strong><p>Total {rupiah(invoice.totalAmount)} · Dibayar {rupiah(invoice.paidAmount)} · Sisa {rupiah(invoice.totalAmount.minus(invoice.paidAmount))}</p><p>Jatuh tempo {invoice.dueDate.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</p>{invoice.allocations.map((allocation) => <p key={allocation.id}>Kuitansi {allocation.payment.receiptNumber} · {rupiah(allocation.amount)}</p>)}</article>)}</div> : <p>Belum ada tagihan.</p>}</section>
  <section className="panel section-panel"><h2>Pengumuman</h2>{announcements.length ? <div className="stats-grid">{announcements.map((item) => <article key={item.id}><span>{item.audience === "SCHOOL" ? "Sekolah" : "Rombel"}</span><strong>{item.title}</strong><p style={{ whiteSpace: "pre-wrap" }}>{item.content}</p></article>)}</div> : <p>Belum ada pengumuman aktif.</p>}</section>
  </div></main></div>;
}