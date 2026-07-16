import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FlashMessage } from "@/components/flash-message";
import { prisma } from "@/lib/prisma";

import { createInvoice } from "../../actions";

function dateInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ q?: string; studentId?: string; error?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  const [categories, selectedStudent, candidates] = await Promise.all([
    prisma.feeCategory.findMany({ where: { schoolId: session.user.schoolId, isActive: true }, orderBy: { name: "asc" } }),
    params.studentId ? prisma.student.findFirst({ where: { id: params.studentId, schoolId: session.user.schoolId, deletedAt: null, status: "ACTIVE" } }) : null,
    query.length >= 2 ? prisma.student.findMany({ where: { schoolId: session.user.schoolId, deletedAt: null, status: "ACTIVE", OR: [{ name: { contains: query, mode: "insensitive" } }, { nis: { contains: query, mode: "insensitive" } }, { nisn: { contains: query, mode: "insensitive" } }] }, orderBy: { name: "asc" }, take: 20 }) : [],
  ]);

  const nextMonth = new Date();
  nextMonth.setDate(nextMonth.getDate() + 30);

  return <div className="admin-page narrow-page">
    <header className="page-header"><div><span className="eyebrow">Keuangan sekolah</span><h1>Buat Invoice Individual</h1><p>Pilih siswa melalui pencarian, tinjau identitasnya, lalu isi detail tagihan.</p></div><Link href="/school/finance" className="secondary-button">Kembali</Link></header>
    {params.error ? <FlashMessage tone="error" title="Invoice belum dibuat" message="Periksa siswa, kategori, nominal, dan tanggal invoice." /> : null}

    {!selectedStudent ? <section className="panel section-panel">
      <div className="section-heading"><div><h2>1. Cari siswa</h2><p>Ketik minimal dua karakter nama, NIS, atau NISN. Hasil dibatasi 20 siswa.</p></div></div>
      <form method="get" className="search-toolbar"><label><span className="sr-only">Cari siswa</span><input name="q" defaultValue={query} placeholder="Nama, NIS, atau NISN..." autoFocus /></label><button className="secondary-button" type="submit">Cari</button></form>
      {query.length > 0 && query.length < 2 ? <p>Masukkan minimal dua karakter.</p> : null}
      {query.length >= 2 && candidates.length === 0 ? <div className="empty-state compact-empty"><strong>Siswa tidak ditemukan</strong><p>Coba kata kunci lain.</p></div> : null}
      {candidates.length > 0 ? <div className="management-grid">{candidates.map((student) => <article className="management-card" key={student.id}><strong>{student.name}</strong><p>NIS {student.nis}{student.nisn ? ` · NISN ${student.nisn}` : ""}</p><Link className="primary-button" href={`/school/finance/invoices/new?studentId=${student.id}`}>Pilih siswa</Link></article>)}</div> : null}
    </section> : <>
      <section className="panel section-panel"><div className="section-heading"><div><h2>1. Siswa terpilih</h2><p>Pastikan identitas siswa benar sebelum menerbitkan invoice.</p></div><Link className="text-button" href="/school/finance/invoices/new">Ganti siswa</Link></div><div className="detail-grid"><article className="detail-card"><span>Nama</span><strong>{selectedStudent.name}</strong></article><article className="detail-card"><span>NIS</span><strong>{selectedStudent.nis}</strong></article><article className="detail-card"><span>NISN</span><strong>{selectedStudent.nisn ?? "—"}</strong></article><article className="detail-card"><span>Status</span><strong>{selectedStudent.status}</strong></article></div></section>
      <section className="panel section-panel form-panel"><div className="section-heading"><div><h2>2. Detail tagihan</h2><p>Invoice langsung diterbitkan dan akan masuk ke histori siswa.</p></div></div>{categories.length === 0 ? <div className="empty-state"><strong>Belum ada kategori aktif</strong><p>Buat kategori tagihan terlebih dahulu.</p><Link href="/school/finance/categories" className="primary-button">Kelola kategori</Link></div> : <form action={createInvoice} className="admin-form form-grid"><input type="hidden" name="studentId" value={selectedStudent.id} /><label>Kategori<select name="feeCategoryId" required defaultValue=""><option value="" disabled>Pilih kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.code} · {category.name}</option>)}</select></label><label>Judul tagihan<input name="title" placeholder="SPP Juli 2026" required /></label><label>Nominal rupiah<input name="amount" inputMode="numeric" placeholder="500000" required /></label><label>Tanggal terbit<input name="issueDate" type="date" defaultValue={dateInput()} required /></label><label>Jatuh tempo<input name="dueDate" type="date" defaultValue={dateInput(nextMonth)} required /></label><label className="field-wide">Catatan<textarea name="description" rows={3} /></label><div className="form-actions field-wide"><button className="primary-button" type="submit">Terbitkan Invoice</button></div></form>}</section>
    </>}
  </div>;
}
