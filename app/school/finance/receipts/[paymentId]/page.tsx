import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function rupiah(value: { toString(): string }) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value.toString()));
}

export default async function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");

  const { paymentId } = await params;
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

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, schoolId: session.user.schoolId },
    include: {
      school: true,
      recordedBy: { include: { user: true } },
      allocations: { include: { invoice: { include: { student: true, items: true } } } },
    },
  });
  if (!payment) redirect("/school/finance?error=payment-not-found");

  return (
    <div className="admin-page">
      <section className="panel section-panel">
        <header className="page-header">
          <div>
            <span className="eyebrow">Bukti pembayaran</span>
            <h1>Kuitansi {payment.receiptNumber}</h1>
            <p>{payment.school.name} · {payment.school.code}</p>
          </div>
        </header>

        <div className="stats-grid">
          <article><span>Tanggal</span><strong>{payment.paidAt.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</strong></article>
          <article><span>Metode</span><strong>{payment.method}</strong></article>
          <article><span>Total diterima</span><strong>{rupiah(payment.amount)}</strong></article>
          <article><span>Petugas</span><strong>{payment.recordedBy.user.name ?? payment.recordedBy.user.email}</strong></article>
        </div>

        <h2>Alokasi Pembayaran</h2>
        {payment.allocations.map((allocation) => (
          <article key={allocation.id} className="panel section-panel">
            <strong>{allocation.invoice.student.name}</strong>
            <p>{allocation.invoice.number} · {allocation.invoice.title}</p>
            <p>Dialokasikan: {rupiah(allocation.amount)}</p>
            <p>Sisa tagihan: {rupiah(allocation.invoice.totalAmount.minus(allocation.invoice.paidAmount))}</p>
          </article>
        ))}

        {payment.reference ? <p>Referensi: {payment.reference}</p> : null}
        {payment.note ? <p>Catatan: {payment.note}</p> : null}
        <p>Dokumen ini dihasilkan oleh sistem dan dapat dicetak melalui menu cetak browser.</p>
      </section>
    </div>
  );
}
