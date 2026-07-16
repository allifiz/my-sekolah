import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FlashMessage } from "@/components/flash-message";
import { prisma } from "@/lib/prisma";

import { createFeeCategory, createInvoice, recordPayment, voidInvoice, voidPayment } from "./actions";

const errorMessages: Record<string, string> = {
  "invalid-category": "Data kategori tagihan belum valid.",
  "duplicate-category": "Kode atau nama kategori sudah digunakan.",
  "invalid-invoice": "Data invoice atau tanggal jatuh tempo belum valid.",
  "invalid-payment": "Data pembayaran belum valid.",
  "reference-not-found": "Siswa atau kategori tagihan tidak ditemukan.",
  "invoice-not-found": "Invoice tidak ditemukan atau sudah lunas/dibatalkan.",
  "payment-not-found": "Pembayaran tidak ditemukan.",
  "invoice-has-payment": "Invoice yang sudah memiliki pembayaran tidak dapat dibatalkan. Batalkan pembayaran terlebih dahulu.",
  "reason-required": "Alasan pembatalan wajib diisi minimal 5 karakter.",
  overpayment: "Nominal pembayaran melebihi sisa tagihan.",
};

function rupiah(value: { toString(): string } | number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value.toString()));
}

function dateInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; q?: string; status?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const member = await prisma.schoolMember.findFirst({
    where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal", "finance"] } } } } },
    select: { id: true },
  });
  if (!member) redirect("/school?error=forbidden");

  const schoolId = session.user.schoolId;
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const status = params.status?.trim() ?? "";
  const [categories, students, invoices, payments] = await Promise.all([
    prisma.feeCategory.findMany({ where: { schoolId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.student.findMany({ where: { schoolId, deletedAt: null, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.invoice.findMany({
      where: { schoolId, ...(status ? { status: status as "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID" } : {}), ...(query ? { OR: [{ number: { contains: query, mode: "insensitive" } }, { title: { contains: query, mode: "insensitive" } }, { student: { name: { contains: query, mode: "insensitive" } } }] } : {}) },
      include: { student: true, items: { include: { feeCategory: true } }, allocations: true },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
    prisma.payment.findMany({ where: { schoolId }, include: { allocations: { include: { invoice: { include: { student: true } } } }, recordedBy: { include: { user: true } } }, orderBy: { paidAt: "desc" }, take: 50 }),
  ]);

  const issued = invoices.filter((item) => item.status !== "VOID");
  const totalBilled = issued.reduce((sum, item) => sum + Number(item.totalAmount), 0);
  const totalPaid = issued.reduce((sum, item) => sum + Number(item.paidAmount), 0);
  const outstanding = totalBilled - totalPaid;
  const overdue = issued.filter((item) => item.status !== "PAID" && item.dueDate < new Date()).reduce((sum, item) => sum + Number(item.totalAmount.minus(item.paidAmount)), 0);
  const openInvoices = issued.filter((item) => ["ISSUED", "PARTIALLY_PAID"].includes(item.status));
  const today = dateInput();
  const nextMonth = new Date(); nextMonth.setDate(nextMonth.getDate() + 30);

  return (
    <div className="admin-page">
      <header className="page-header">
        <div><span className="eyebrow">Keuangan sekolah</span><h1>Tagihan dan Pembayaran</h1><p>Terbitkan invoice siswa, catat pembayaran, pantau tunggakan, dan cetak kuitansi.</p></div>
        <div className="dashboard-actions"><Link className="secondary-button" href="/school/finance/categories">Kelola Kategori</Link><Link className="secondary-button" href="/school/finance/reports">Laporan</Link><Link className="primary-button" href="/school/finance/bulk">Invoice Massal</Link></div>
      </header>
      {params.error ? <FlashMessage tone="error" title="Transaksi gagal" message={errorMessages[params.error] ?? "Terjadi kesalahan."} /> : null}
      {params.success ? <FlashMessage tone="success" title="Data keuangan diperbarui" message="Perubahan transaksi sudah tersimpan dan tercatat pada audit log." /> : null}
      <section className="stats-grid"><article><span>Total tagihan</span><strong>{rupiah(totalBilled)}</strong></article><article><span>Total dibayar</span><strong>{rupiah(totalPaid)}</strong></article><article><span>Sisa tagihan</span><strong>{rupiah(outstanding)}</strong></article><article><span>Jatuh tempo</span><strong>{rupiah(overdue)}</strong></article></section>
      <section className="panel section-panel toolbar-panel"><form className="filter-toolbar" method="get"><label>Cari invoice<input name="q" defaultValue={query} placeholder="Nomor, siswa, atau judul..." /></label><label>Status<select name="status" defaultValue={status}><option value="">Semua status</option><option value="ISSUED">Issued</option><option value="PARTIALLY_PAID">Sebagian dibayar</option><option value="PAID">Lunas</option><option value="VOID">Dibatalkan</option></select></label><button className="secondary-button" type="submit">Terapkan</button>{query || status ? <Link className="text-button" href="/school/finance">Reset</Link> : null}</form></section>
      <section className="content-grid">
        <section className="panel section-panel form-panel"><div className="section-heading"><div><h2>Tambah Kategori</h2><p>Gunakan kode singkat yang mudah dikenali.</p></div></div><form action={createFeeCategory} className="admin-form"><label>Kode<input name="code" placeholder="SPP" required /></label><label>Nama kategori<input name="name" placeholder="SPP Bulanan" required /></label><label>Deskripsi<textarea name="description" rows={2} /></label><button className="primary-button" type="submit">Simpan Kategori</button></form></section>
        <section className="panel section-panel form-panel"><div className="section-heading"><div><h2>Catat Pembayaran</h2><p>{openInvoices.length} invoice masih terbuka.</p></div></div>{openInvoices.length === 0 ? <div className="empty-state"><strong>Tidak ada invoice terbuka</strong><p>Semua invoice sudah lunas atau belum diterbitkan.</p></div> : <form action={recordPayment} className="admin-form"><label>Invoice<select name="invoiceId" required defaultValue=""><option value="" disabled>Pilih invoice</option>{openInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number} · {invoice.student.name} · sisa {rupiah(invoice.totalAmount.minus(invoice.paidAmount))}</option>)}</select></label><label>Nominal<input name="amount" inputMode="numeric" required /></label><label>Tanggal bayar<input name="paidAt" type="date" defaultValue={today} required /></label><label>Metode<select name="method" defaultValue="CASH"><option value="CASH">Tunai</option><option value="TRANSFER">Transfer</option><option value="QRIS">QRIS</option><option value="OTHER">Lainnya</option></select></label><label>Referensi<input name="reference" placeholder="Nomor transfer atau referensi" /></label><label>Catatan<textarea name="note" rows={2} /></label><button className="primary-button" type="submit">Simpan dan Cetak Kuitansi</button></form>}</section>
      </section>
      <section className="panel section-panel form-panel"><div className="section-heading"><div><h2>Terbitkan Invoice</h2><p>Buat tagihan individual untuk siswa aktif.</p></div></div>{categories.length === 0 || students.length === 0 ? <div className="empty-state"><strong>Data referensi belum lengkap</strong><p>Buat kategori tagihan dan siswa aktif terlebih dahulu.</p></div> : <form action={createInvoice} className="admin-form form-grid"><label>Siswa<select name="studentId" required defaultValue=""><option value="" disabled>Pilih siswa</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis}</option>)}</select></label><label>Kategori<select name="feeCategoryId" required defaultValue=""><option value="" disabled>Pilih kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.code} · {category.name}</option>)}</select></label><label>Judul tagihan<input name="title" placeholder="SPP Juli 2026" required /></label><label>Nominal rupiah<input name="amount" inputMode="numeric" placeholder="500000" required /></label><label>Tanggal terbit<input name="issueDate" type="date" defaultValue={today} required /></label><label>Jatuh tempo<input name="dueDate" type="date" defaultValue={dateInput(nextMonth)} required /></label><label className="field-wide">Catatan<textarea name="description" rows={2} /></label><div className="form-actions field-wide"><button className="primary-button" type="submit">Terbitkan Invoice</button></div></form>}</section>
      <section className="panel section-panel"><div className="section-heading"><div><h2>Daftar Invoice</h2><p>{invoices.length} invoice sesuai filter.</p></div></div>{invoices.length === 0 ? <div className="empty-state"><strong>Tidak ada invoice yang cocok</strong><p>Ubah filter atau terbitkan invoice baru.</p></div> : <div className="management-grid">{invoices.map((invoice) => <article className="management-card" key={invoice.id}><div className="management-card-head"><div><strong>{invoice.student.name}</strong><p>{invoice.number} · {invoice.title}</p></div><span className={`status-badge status-${invoice.status.toLowerCase()}`}>{invoice.status}</span></div><p>Total {rupiah(invoice.totalAmount)} · Dibayar {rupiah(invoice.paidAmount)} · Sisa {rupiah(invoice.totalAmount.minus(invoice.paidAmount))}</p><p>Jatuh tempo {invoice.dueDate.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</p>{invoice.status !== "VOID" && invoice.paidAmount.equals(0) ? <form action={voidInvoice} className="inline-management-form"><input type="hidden" name="invoiceId" value={invoice.id} /><input aria-label={`Alasan pembatalan ${invoice.number}`} name="reason" minLength={5} placeholder="Alasan pembatalan" required /><button type="submit" className="secondary-button">Batalkan</button></form> : null}</article>)}</div>}</section>
      <section className="panel section-panel"><div className="section-heading"><div><h2>Pembayaran Terbaru</h2><p>50 transaksi pembayaran terbaru.</p></div></div>{payments.length === 0 ? <div className="empty-state"><strong>Belum ada pembayaran</strong><p>Pembayaran yang dicatat akan tampil di sini.</p></div> : <div className="management-grid">{payments.map((payment) => { const allocation = payment.allocations[0]; return <article className="management-card" key={payment.id}><div className="management-card-head"><div><strong>{rupiah(payment.amount)}</strong><p>{payment.receiptNumber} · {payment.method}</p></div><Link className="table-link" href={`/school/finance/receipts/${payment.id}`}>Kuitansi</Link></div><p>{allocation ? `${allocation.invoice.student.name} · ${allocation.invoice.number}` : "Tanpa alokasi"}</p><p>{payment.paidAt.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })} · {payment.recordedBy.user.name ?? payment.recordedBy.user.email}</p><form action={voidPayment} className="inline-management-form"><input type="hidden" name="paymentId" value={payment.id} /><input aria-label={`Alasan pembatalan ${payment.receiptNumber}`} name="reason" minLength={5} placeholder="Alasan pembatalan" required /><button type="submit" className="secondary-button">Batalkan</button></form></article>; })}</div>}</section>
    </div>
  );
}
