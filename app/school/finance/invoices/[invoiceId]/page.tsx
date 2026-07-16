import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { ConfirmAction } from "@/components/confirm-action";
import { FlashMessage } from "@/components/flash-message";
import { prisma } from "@/lib/prisma";

import { recordPayment, voidInvoice } from "../../actions";

function rupiah(value: { toString(): string } | number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value.toString()));
}

function dateInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ invoiceId: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const [{ invoiceId }, query] = await Promise.all([params, searchParams]);

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, schoolId: session.user.schoolId },
    include: {
      student: true,
      items: { include: { feeCategory: true } },
      allocations: { include: { payment: { include: { recordedBy: { include: { user: true } } } } }, orderBy: { payment: { paidAt: "desc" } } },
      createdBy: { include: { user: true } },
    },
  });
  if (!invoice) notFound();

  const outstanding = invoice.totalAmount.minus(invoice.paidAmount);
  const canPay = ["ISSUED", "PARTIALLY_PAID"].includes(invoice.status) && outstanding.greaterThan(0);
  const canVoid = invoice.status !== "VOID" && invoice.paidAmount.equals(0);

  return <div className="admin-page">
    <header className="page-header"><div><span className="eyebrow">Workspace invoice</span><h1>{invoice.number}</h1><p>{invoice.student.name} · {invoice.title}</p></div><div className="dashboard-actions"><Link href={`/school/students/${invoice.studentId}`} className="secondary-button">Buka siswa</Link><Link href="/school/finance" className="secondary-button">Kembali ke invoice</Link></div></header>
    {query.error ? <FlashMessage tone="error" title="Transaksi belum diproses" message="Periksa nominal, status invoice, atau alasan pembatalan." /> : null}
    {query.success ? <FlashMessage tone="success" title="Invoice diperbarui" message="Perubahan sudah tercatat pada audit log." /> : null}

    <section className="detail-grid">
      <article className="detail-card"><span>Total</span><strong>{rupiah(invoice.totalAmount)}</strong></article>
      <article className="detail-card"><span>Sudah dibayar</span><strong>{rupiah(invoice.paidAmount)}</strong></article>
      <article className="detail-card"><span>Sisa</span><strong>{rupiah(outstanding)}</strong></article>
      <article className="detail-card"><span>Status</span><strong>{invoice.status}</strong></article>
    </section>

    <section className="content-grid">
      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Detail invoice</h2><p>Informasi penerbitan dan item tagihan.</p></div><span className={`status-badge status-${invoice.status.toLowerCase()}`}>{invoice.status}</span></div>
        <dl className="definition-list"><div><dt>Siswa</dt><dd>{invoice.student.name} · NIS {invoice.student.nis}</dd></div><div><dt>Tanggal terbit</dt><dd>{invoice.issueDate.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</dd></div><div><dt>Jatuh tempo</dt><dd>{invoice.dueDate.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</dd></div><div><dt>Dibuat oleh</dt><dd>{invoice.createdBy.user.name ?? invoice.createdBy.user.email}</dd></div><div><dt>Catatan</dt><dd>{invoice.description ?? "—"}</dd></div></dl>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Kategori</th><th>Deskripsi</th><th>Nominal</th></tr></thead><tbody>{invoice.items.map((item) => <tr key={item.id}><td>{item.feeCategory ? `${item.feeCategory.code} · ${item.feeCategory.name}` : "Tanpa kategori"}</td><td>{item.description}</td><td>{rupiah(item.totalAmount)}</td></tr>)}</tbody></table></div>
      </section>

      <aside className="panel section-panel">
        <div className="section-heading"><div><h2>Aksi invoice</h2><p>Aksi hanya berlaku untuk invoice ini.</p></div></div>
        {canPay ? <form action={recordPayment} className="admin-form"><input type="hidden" name="invoiceId" value={invoice.id} /><label>Nominal<input name="amount" inputMode="numeric" defaultValue={outstanding.toFixed(0)} required /></label><label>Tanggal bayar<input name="paidAt" type="date" defaultValue={dateInput()} required /></label><label>Metode<select name="method" defaultValue="CASH"><option value="CASH">Tunai</option><option value="TRANSFER">Transfer</option><option value="QRIS">QRIS</option><option value="OTHER">Lainnya</option></select></label><label>Referensi<input name="reference" placeholder="Nomor transfer atau referensi" /></label><label>Catatan<textarea name="note" rows={2} /></label><button className="primary-button" type="submit">Simpan dan buka kuitansi</button></form> : <div className="empty-state compact-empty"><strong>Pembayaran tidak tersedia</strong><p>{invoice.status === "PAID" ? "Invoice sudah lunas." : invoice.status === "VOID" ? "Invoice sudah dibatalkan." : "Tidak ada sisa tagihan."}</p></div>}
        {canVoid ? <div className="form-actions"><ConfirmAction action={voidInvoice} triggerLabel="Batalkan invoice" title={`Batalkan ${invoice.number}?`} description="Invoice akan berstatus VOID dan tidak lagi dihitung sebagai tagihan aktif. Aksi ini dicatat pada audit log." confirmLabel="Ya, batalkan invoice"><input type="hidden" name="invoiceId" value={invoice.id} /><label className="field-wide">Alasan<textarea name="reason" minLength={5} required placeholder="Jelaskan alasan pembatalan" /></label></ConfirmAction></div> : null}
      </aside>
    </section>

    <section className="panel section-panel">
      <div className="section-heading"><div><h2>Riwayat pembayaran</h2><p>{invoice.allocations.length} transaksi teralokasi ke invoice ini.</p></div></div>
      {invoice.allocations.length === 0 ? <div className="empty-state compact-empty"><strong>Belum ada pembayaran</strong><p>Catat pembayaran dari panel aksi invoice.</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Kuitansi</th><th>Tanggal</th><th>Metode</th><th>Nominal</th><th>Petugas</th><th>Aksi</th></tr></thead><tbody>{invoice.allocations.map((allocation) => <tr key={allocation.id}><td>{allocation.payment.receiptNumber}</td><td>{allocation.payment.paidAt.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</td><td>{allocation.payment.method}</td><td>{rupiah(allocation.amount)}</td><td>{allocation.payment.recordedBy.user.name ?? allocation.payment.recordedBy.user.email}</td><td><Link className="table-link" href={`/school/finance/receipts/${allocation.paymentId}`}>Buka kuitansi</Link></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
