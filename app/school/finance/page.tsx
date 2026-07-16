import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FlashMessage } from "@/components/flash-message";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 25;

const errorMessages: Record<string, string> = {
  "invalid-category": "Data kategori tagihan belum valid.",
  "duplicate-category": "Kode atau nama kategori sudah digunakan.",
  "invalid-invoice": "Data invoice atau tanggal jatuh tempo belum valid.",
  "invalid-payment": "Data pembayaran belum valid.",
  "reference-not-found": "Siswa atau kategori tagihan tidak ditemukan.",
  "invoice-not-found": "Invoice tidak ditemukan atau sudah tidak dapat diproses.",
  "payment-not-found": "Pembayaran tidak ditemukan.",
  "invoice-has-payment": "Invoice yang sudah memiliki pembayaran tidak dapat dibatalkan. Batalkan pembayaran terlebih dahulu.",
  "reason-required": "Alasan pembatalan wajib diisi minimal 5 karakter.",
  overpayment: "Nominal pembayaran melebihi sisa tagihan.",
};

function rupiah(value: { toString(): string } | number | null | undefined) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value?.toString() ?? 0));
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; q?: string; status?: string; page?: string }>;
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
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const status = params.status?.trim() ?? "";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;

  const invoiceWhere = {
    schoolId,
    ...(status ? { status: status as "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID" } : {}),
    ...(query
      ? {
          OR: [
            { number: { contains: query, mode: "insensitive" as const } },
            { title: { contains: query, mode: "insensitive" as const } },
            { student: { name: { contains: query, mode: "insensitive" as const } } },
            { student: { nis: { contains: query, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [summary, overdueSummary, totalInvoices, invoices, recentPayments] = await Promise.all([
    prisma.invoice.aggregate({
      where: { schoolId, status: { not: "VOID" } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.invoice.aggregate({
      where: { schoolId, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: new Date() } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.invoice.count({ where: invoiceWhere }),
    prisma.invoice.findMany({
      where: invoiceWhere,
      include: { student: true },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.payment.findMany({
      where: { schoolId },
      include: { allocations: { include: { invoice: { include: { student: true } } } } },
      orderBy: { paidAt: "desc" },
      take: 8,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalInvoices / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const totalBilled = Number(summary._sum.totalAmount?.toString() ?? 0);
  const totalPaid = Number(summary._sum.paidAmount?.toString() ?? 0);
  const overdue = Number(overdueSummary._sum.totalAmount?.toString() ?? 0) - Number(overdueSummary._sum.paidAmount?.toString() ?? 0);
  const pageHref = (page: number) => `/school/finance?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(status ? { status } : {}), page: String(page) })}`;

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Keuangan sekolah</span>
          <h1>Invoice dan Pembayaran</h1>
          <p>Cari invoice, buka detail siswa, lalu catat pembayaran atau pembatalan dari konteks invoice yang tepat.</p>
        </div>
        <div className="dashboard-actions">
          <Link className="secondary-button" href="/school/finance/categories">Kategori</Link>
          <Link className="secondary-button" href="/school/finance/reports">Laporan</Link>
          <Link className="secondary-button" href="/school/finance/bulk">Invoice Massal</Link>
          <Link className="primary-button" href="/school/finance/invoices/new">Buat Invoice</Link>
        </div>
      </header>

      {params.error ? <FlashMessage tone="error" title="Transaksi gagal" message={errorMessages[params.error] ?? "Terjadi kesalahan."} /> : null}
      {params.success ? <FlashMessage tone="success" title="Data keuangan diperbarui" message="Perubahan transaksi sudah tersimpan dan tercatat pada audit log." /> : null}

      <section className="stats-grid">
        <article><span>Total tagihan aktif</span><strong>{rupiah(totalBilled)}</strong></article>
        <article><span>Total pembayaran</span><strong>{rupiah(totalPaid)}</strong></article>
        <article><span>Sisa tagihan</span><strong>{rupiah(totalBilled - totalPaid)}</strong></article>
        <article><span>Lewat jatuh tempo</span><strong>{rupiah(overdue)}</strong></article>
      </section>

      <section className="panel section-panel toolbar-panel">
        <form className="filter-toolbar" method="get">
          <label>Cari invoice<input name="q" defaultValue={query} placeholder="Nomor, nama siswa, NIS, atau judul..." /></label>
          <label>Status<select name="status" defaultValue={status}><option value="">Semua status</option><option value="ISSUED">Belum dibayar</option><option value="PARTIALLY_PAID">Sebagian dibayar</option><option value="PAID">Lunas</option><option value="VOID">Dibatalkan</option></select></label>
          <button className="secondary-button" type="submit">Terapkan</button>
          {query || status ? <Link className="text-button" href="/school/finance">Reset</Link> : null}
        </form>
      </section>

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Daftar Invoice</h2><p>{totalInvoices} invoice sesuai filter. Menampilkan maksimal {PAGE_SIZE} per halaman.</p></div></div>
        {invoices.length === 0 ? (
          <div className="empty-state"><strong>Tidak ada invoice yang cocok</strong><p>Ubah filter atau buat invoice baru untuk siswa.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Invoice</th><th>Siswa</th><th>Jatuh tempo</th><th>Status</th><th>Sisa</th><th>Aksi</th></tr></thead>
              <tbody>{invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td><strong>{invoice.number}</strong><small>{invoice.title}</small></td>
                  <td><strong>{invoice.student.name}</strong><small>NIS {invoice.student.nis}</small></td>
                  <td>{invoice.dueDate.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
                  <td><span className={`status-badge status-${invoice.status.toLowerCase()}`}>{invoice.status}</span></td>
                  <td>{rupiah(invoice.totalAmount.minus(invoice.paidAmount))}</td>
                  <td><Link className="table-link" href={`/school/finance/invoices/${invoice.id}`}>Buka detail</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {totalPages > 1 ? <nav className="pagination" aria-label="Pagination invoice"><Link href={pageHref(Math.max(1, safePage - 1))} className={safePage === 1 ? "secondary-button is-disabled" : "secondary-button"}>Sebelumnya</Link><span>Halaman {safePage} dari {totalPages}</span><Link href={pageHref(Math.min(totalPages, safePage + 1))} className={safePage === totalPages ? "secondary-button is-disabled" : "secondary-button"}>Berikutnya</Link></nav> : null}
      </section>

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Pembayaran terbaru</h2><p>Ringkasan delapan transaksi terakhir. Pembatalan dilakukan dari halaman kuitansi.</p></div><Link className="secondary-button" href="/school/finance/reports">Lihat laporan</Link></div>
        {recentPayments.length === 0 ? <div className="empty-state compact-empty"><strong>Belum ada pembayaran</strong><p>Pembayaran akan muncul setelah dicatat dari detail invoice.</p></div> : <div className="management-grid">{recentPayments.map((payment) => { const allocation = payment.allocations[0]; return <article className="management-card" key={payment.id}><div className="management-card-head"><div><strong>{rupiah(payment.amount)}</strong><p>{payment.receiptNumber} · {payment.method}</p></div><Link className="table-link" href={`/school/finance/receipts/${payment.id}`}>Kuitansi</Link></div><p>{allocation ? `${allocation.invoice.student.name} · ${allocation.invoice.number}` : "Tanpa alokasi"}</p><p>{payment.paidAt.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</p></article>; })}</div>}
      </section>
    </div>
  );
}
