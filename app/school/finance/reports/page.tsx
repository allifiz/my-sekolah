import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function rupiah(value: { toString(): string } | number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value.toString()));
}

function monthBounds(month: string) {
  const valid = /^\d{4}-\d{2}$/.test(month) ? month : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  const start = new Date(`${valid}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { valid, start, end };
}

export default async function FinanceReportsPage({ searchParams }: { searchParams: Promise<{ month?: string; studentId?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");

  const member = await prisma.schoolMember.findFirst({
    where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal", "finance"] } } } } },
    select: { id: true },
  });
  if (!member) redirect("/school?error=forbidden");

  const params = await searchParams;
  const { valid: month, start, end } = monthBounds(params.month ?? "");
  const studentId = params.studentId && /^c[a-z0-9]+$/i.test(params.studentId) ? params.studentId : undefined;
  const schoolId = session.user.schoolId;

  const [students, invoices, payments] = await Promise.all([
    prisma.student.findMany({ where: { schoolId, deletedAt: null }, select: { id: true, nis: true, name: true }, orderBy: { name: "asc" } }),
    prisma.invoice.findMany({
      where: { schoolId, ...(studentId ? { studentId } : {}), OR: [{ issueDate: { gte: start, lt: end } }, { status: { in: ["ISSUED", "PARTIALLY_PAID"] } }] },
      include: { student: true, items: { include: { feeCategory: true } } },
      orderBy: [{ dueDate: "asc" }, { student: { name: "asc" } }],
    }),
    prisma.payment.findMany({
      where: { schoolId, paidAt: { gte: start, lt: end }, ...(studentId ? { allocations: { some: { invoice: { studentId } } } } : {}) },
      include: { allocations: { include: { invoice: { include: { student: true } } } }, recordedBy: { include: { user: true } } },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  const activeInvoices = invoices.filter((item) => item.status !== "VOID");
  const billed = activeInvoices.filter((item) => item.issueDate >= start && item.issueDate < end).reduce((sum, item) => sum + Number(item.totalAmount), 0);
  const collected = payments.reduce((sum, item) => sum + Number(item.amount), 0);
  const outstanding = activeInvoices.filter((item) => ["ISSUED", "PARTIALLY_PAID"].includes(item.status)).reduce((sum, item) => sum + Number(item.totalAmount.minus(item.paidAmount)), 0);
  const overdue = activeInvoices.filter((item) => ["ISSUED", "PARTIALLY_PAID"].includes(item.status) && item.dueDate < new Date()).reduce((sum, item) => sum + Number(item.totalAmount.minus(item.paidAmount)), 0);

  const studentSummary = new Map<string, { student: (typeof students)[number]; billed: number; paid: number; outstanding: number }>();
  for (const student of students) studentSummary.set(student.id, { student, billed: 0, paid: 0, outstanding: 0 });
  for (const invoice of activeInvoices) {
    const row = studentSummary.get(invoice.studentId);
    if (!row) continue;
    if (invoice.issueDate >= start && invoice.issueDate < end) row.billed += Number(invoice.totalAmount);
    row.paid += Number(invoice.paidAmount);
    if (["ISSUED", "PARTIALLY_PAID"].includes(invoice.status)) row.outstanding += Number(invoice.totalAmount.minus(invoice.paidAmount));
  }
  const visibleSummary = [...studentSummary.values()].filter((item) => item.billed || item.paid || item.outstanding).sort((a, b) => b.outstanding - a.outstanding || a.student.name.localeCompare(b.student.name));

  const query = new URLSearchParams({ month, ...(studentId ? { studentId } : {}) });

  return (
    <div className="admin-page">
      <header className="page-header">
        <div><span className="eyebrow">Keuangan sekolah</span><h1>Laporan Keuangan</h1><p>Rekap tagihan, penerimaan, saldo, tunggakan, dan posisi setiap siswa.</p></div>
        <div><Link href="/school/finance">Keuangan</Link> · <Link href={`/school/finance/reports/export?${query.toString()}`}>Export CSV</Link></div>
      </header>

      <section className="panel section-panel">
        <form method="get" className="admin-form">
          <label>Bulan<input type="month" name="month" defaultValue={month} /></label>
          <label>Siswa
            <select name="studentId" defaultValue={studentId ?? ""}>
              <option value="">Semua siswa</option>
              {students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis}</option>)}
            </select>
          </label>
          <button type="submit" className="secondary-button">Tampilkan</button>
        </form>
      </section>

      <section className="stats-grid">
        <article><span>Tagihan bulan ini</span><strong>{rupiah(billed)}</strong></article>
        <article><span>Penerimaan bulan ini</span><strong>{rupiah(collected)}</strong></article>
        <article><span>Saldo terbuka</span><strong>{rupiah(outstanding)}</strong></article>
        <article><span>Tunggakan</span><strong>{rupiah(overdue)}</strong></article>
      </section>

      <section className="panel section-panel">
        <h2>Posisi per Siswa</h2>
        {visibleSummary.length === 0 ? <p>Belum ada data pada filter ini.</p> : <div className="stats-grid">{visibleSummary.map((row) => <article key={row.student.id}><span>{row.student.nis}</span><strong>{row.student.name}</strong><p>Tagihan periode {rupiah(row.billed)}</p><p>Dibayar {rupiah(row.paid)} · Saldo {rupiah(row.outstanding)}</p></article>)}</div>}
      </section>

      <section className="panel section-panel">
        <h2>Invoice Terbuka dan Periode</h2>
        {invoices.length === 0 ? <p>Belum ada invoice.</p> : <div className="stats-grid">{invoices.map((invoice) => <article key={invoice.id}><span>{invoice.number} · {invoice.status}</span><strong>{invoice.student.name}</strong><p>{invoice.title}</p><p>Total {rupiah(invoice.totalAmount)} · Dibayar {rupiah(invoice.paidAmount)} · Sisa {rupiah(invoice.totalAmount.minus(invoice.paidAmount))}</p><p>Jatuh tempo {invoice.dueDate.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</p></article>)}</div>}
      </section>

      <section className="panel section-panel">
        <h2>Pembayaran Periode</h2>
        {payments.length === 0 ? <p>Belum ada pembayaran.</p> : <div className="stats-grid">{payments.map((payment) => <article key={payment.id}><span>{payment.receiptNumber} · {payment.method}</span><strong>{rupiah(payment.amount)}</strong><p>{payment.allocations.map((allocation) => `${allocation.invoice.student.name} · ${allocation.invoice.number}`).join(" · ")}</p><p>{payment.paidAt.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</p></article>)}</div>}
      </section>
    </div>
  );
}
