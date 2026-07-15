import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { createFeeCategory, createInvoice, recordPayment } from "./actions";

const errorMessages: Record<string, string> = {
  "invalid-category": "Data kategori tagihan belum valid.",
  "duplicate-category": "Kode atau nama kategori sudah digunakan.",
  "invalid-invoice": "Data invoice atau tanggal jatuh tempo belum valid.",
  "invalid-payment": "Data pembayaran belum valid.",
  "reference-not-found": "Siswa atau kategori tagihan tidak ditemukan.",
  "invoice-not-found": "Invoice tidak ditemukan atau sudah lunas.",
  overpayment: "Nominal pembayaran melebihi sisa tagihan.",
};

function rupiah(value: { toString(): string } | number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value.toString()));
}

function dateInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");

  const member = await prisma.schoolMember.findFirst({
    where: {
      schoolId: session.user.schoolId,
      userId: session.user.id,
      status: "ACTIVE",
      deletedAt: null,
      roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal", "finance"] } } } },
    },
    select: { id: true },
  });
  if (!member) redirect("/school?error=forbidden");

  const schoolId = session.user.schoolId;
  const [params, categories, students, invoices, payments] = await Promise.all([
    searchParams,
    prisma.feeCategory.findMany({ where: { schoolId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.student.findMany({ where: { schoolId, deletedAt: null, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.invoice.findMany({
      where: { schoolId },
      include: { student: true, items: { include: { feeCategory: true } }, allocations: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.payment.findMany({
      where: { schoolId },
      include: { allocations: { include: { invoice: { include: { student: true } } } }, recordedBy: { include: { user: true } } },
      orderBy: { paidAt: "desc" },
      take: 50,
    }),
  ]);

  const issued = invoices.filter((item) => item.status !== "VOID");
  const totalBilled = issued.reduce((sum, item) => sum + Number(item.totalAmount), 0);
  const totalPaid = issued.reduce((sum, item) => sum + Number(item.paidAmount), 0);
  const outstanding = totalBilled - totalPaid;
  const overdue = issued.filter((item) => item.status !== "PAID" && item.dueDate < new Date()).reduce((sum, item) => sum + Number(item.totalAmount.minus(item.paidAmount)), 0);
  const openInvoices = issued.filter((item) => ["ISSUED", "PARTIALLY_PAID"].includes(item.status));
  const today = dateInput();
  const nextMonth = new Date();
  nextMonth.setDate(nextMonth.getDate() + 30);

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Keuangan sekolah</span>
          <h1>Tagihan dan Pembayaran</h1>
          <p>Terbitkan invoice siswa, catat pembayaran, pantau tunggakan, dan cetak kuitansi.</p>
        </div>
      </header>

      {params.error ? <section className="panel section-panel"><strong>Gagal:</strong> {errorMessages[params.error] ?? "Terjadi kesalahan."}</section> : null}
      {params.success ? <section className="panel section-panel"><strong>Berhasil:</strong> Data keuangan sudah diperbarui.</section> : null}

      <section className="stats-grid">
        <article><span>Total tagihan</span><strong>{rupiah(totalBilled)}</strong></article>
        <article><span>Total dibayar</span><strong>{rupiah(totalPaid)}</strong></article>
        <article><span>Sisa tagihan</span><strong>{rupiah(outstanding)}</strong></article>
        <article><span>Jatuh tempo</span><strong>{rupiah(overdue)}</strong></article>
      </section>

      <section className="panel section-panel">
        <h2>Tambah Kategori Tagihan</h2>
        <form action={createFeeCategory} className="admin-form">
          <label>Kode<input name="code" placeholder="SPP" required /></label>
          <label>Nama kategori<input name="name" placeholder="SPP Bulanan" required /></label>
          <label>Deskripsi<textarea name="description" rows={2} /></label>
          <button className="primary-button" type="submit">Simpan Kategori</button>
        </form>
      </section>

      <section className="panel section-panel">
        <h2>Terbitkan Invoice</h2>
        {categories.length === 0 || students.length === 0 ? <p>Buat kategori dan siswa aktif terlebih dahulu.</p> : (
          <form action={createInvoice} className="admin-form">
            <label>Siswa
              <select name="studentId" required defaultValue=""><option value="" disabled>Pilih siswa</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis}</option>)}</select>
            </label>
            <label>Kategori
              <select name="feeCategoryId" required defaultValue=""><option value="" disabled>Pilih kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.code} · {category.name}</option>)}</select>
            </label>
            <label>Judul tagihan<input name="title" placeholder="SPP Juli 2026" required /></label>
            <label>Nominal rupiah<input name="amount" inputMode="numeric" placeholder="500000" required /></label>
            <label>Tanggal terbit<input name="issueDate" type="date" defaultValue={today} required /></label>
            <label>Jatuh tempo<input name="dueDate" type="date" defaultValue={dateInput(nextMonth)} required /></label>
            <label>Catatan<textarea name="description" rows={2} /></label>
            <button className="primary-button" type="submit">Terbitkan Invoice</button>
          </form>
        )}
      </section>

      <section className="panel section-panel">
        <h2>Catat Pembayaran</h2>
        {openInvoices.length === 0 ? <p>Tidak ada invoice terbuka.</p> : (
          <form action={recordPayment} className="admin-form">
            <label>Invoice
              <select name="invoiceId" required defaultValue=""><option value="" disabled>Pilih invoice</option>{openInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number} · {invoice.student.name} · sisa {rupiah(invoice.totalAmount.minus(invoice.paidAmount))}</option>)}</select>
            </label>
            <label>Nominal<input name="amount" inputMode="numeric" required /></label>
            <label>Tanggal bayar<input name="paidAt" type="date" defaultValue={today} required /></label>
            <label>Metode
              <select name="method" defaultValue="CASH"><option value="CASH">Tunai</option><option value="TRANSFER">Transfer</option><option value="QRIS">QRIS</option><option value="OTHER">Lainnya</option></select>
            </label>
            <label>Referensi<input name="reference" placeholder="Nomor transfer atau referensi" /></label>
            <label>Catatan<textarea name="note" rows={2} /></label>
            <button className="primary-button" type="submit">Simpan dan Cetak Kuitansi</button>
          </form>
        )}
      </section>

      <section className="panel section-panel">
        <h2>Daftar Invoice</h2>
        {invoices.length === 0 ? <p>Belum ada invoice.</p> : (
          <div className="stats-grid">
            {invoices.map((invoice) => (
              <article key={invoice.id}>
                <span>{invoice.number} · {invoice.status}</span>
                <strong>{invoice.student.name}</strong>
                <p>{invoice.title}</p>
                <p>Total {rupiah(invoice.totalAmount)} · Dibayar {rupiah(invoice.paidAmount)} · Sisa {rupiah(invoice.totalAmount.minus(invoice.paidAmount))}</p>
                <p>Jatuh tempo {invoice.dueDate.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel section-panel">
        <h2>Pembayaran Terbaru</h2>
        {payments.length === 0 ? <p>Belum ada pembayaran.</p> : (
          <div className="stats-grid">
            {payments.map((payment) => {
              const allocation = payment.allocations[0];
              return (
                <article key={payment.id}>
                  <span>{payment.receiptNumber} · {payment.method}</span>
                  <strong>{rupiah(payment.amount)}</strong>
                  <p>{allocation ? `${allocation.invoice.student.name} · ${allocation.invoice.number}` : "Tanpa alokasi"}</p>
                  <p>{payment.paidAt.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })} · dicatat oleh {payment.recordedBy.user.name ?? payment.recordedBy.user.email}</p>
                  <Link href={`/school/finance/receipts/${payment.id}`}>Buka kuitansi</Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
