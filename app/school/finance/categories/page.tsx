import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ModalForm } from "@/components/modal-form";
import { prisma } from "@/lib/prisma";

import { createFeeCategory, deleteFeeCategory } from "./actions";

const errors: Record<string, string> = {
  "invalid-request": "Permintaan hapus tidak valid.",
  "invalid-category": "Kode, nama, atau deskripsi kategori belum valid.",
  "duplicate-category": "Kode atau nama kategori sudah digunakan.",
  "not-found": "Kategori biaya tidak ditemukan.",
  "category-in-use": "Kategori sudah digunakan pada invoice dan tidak boleh dihapus.",
};

export default async function FeeCategoriesPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const member = await prisma.schoolMember.findFirst({ where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal", "finance"] } } } } }, select: { id: true } });
  if (!member) redirect("/school?error=forbidden");
  const [categories, params] = await Promise.all([
    prisma.feeCategory.findMany({ where: { schoolId: session.user.schoolId }, include: { _count: { select: { items: true } } }, orderBy: { name: "asc" } }),
    searchParams,
  ]);
  return (
    <div className="admin-page">
      <header className="page-header">
        <div><span className="eyebrow">Keuangan sekolah</span><h1>Kategori Biaya</h1><p>Buat kategori untuk mengelompokkan item invoice, lalu hapus kategori yang salah selama belum pernah digunakan.</p></div>
        <div className="dashboard-actions">
          <Link href="/school/finance" className="secondary-button">Kembali ke Keuangan</Link>
          <ModalForm triggerLabel="Tambah Kategori" title="Tambah kategori biaya" description="Gunakan kode singkat dan unik agar mudah dikenali saat membuat invoice.">
            <form action={createFeeCategory} className="admin-form">
              <label>Kode<input name="code" placeholder="SPP" required autoFocus /></label>
              <label>Nama kategori<input name="name" placeholder="SPP Bulanan" required /></label>
              <label>Deskripsi<textarea name="description" rows={3} placeholder="Opsional" /></label>
              <div className="form-actions"><button type="submit" className="primary-button">Simpan Kategori</button></div>
            </form>
          </ModalForm>
        </div>
      </header>
      {params.error ? <section className="panel section-panel"><strong>Gagal:</strong> {errors[params.error] ?? "Terjadi kesalahan."}</section> : null}
      {params.success ? <section className="panel section-panel"><strong>Berhasil:</strong> {params.success === "created" ? "Kategori biaya berhasil dibuat." : "Kategori biaya sudah dihapus."}</section> : null}
      <section className="panel section-panel"><div className="section-heading"><div><h2>Daftar Kategori</h2><p>{categories.length} kategori tersedia untuk invoice.</p></div></div>{categories.length === 0 ? <div className="empty-state"><strong>Belum ada kategori biaya</strong><p>Klik Tambah Kategori untuk membuat kategori pertama.</p></div> : <div className="management-grid">{categories.map((category) => <article className="management-card" key={category.id}><div className="management-card-head"><div><strong>{category.code} · {category.name}</strong><p>{category.description ?? "Tanpa deskripsi"}</p></div><span>{category._count.items} penggunaan</span></div><form action={deleteFeeCategory}><input type="hidden" name="feeCategoryId" value={category.id} /><button type="submit" className="secondary-button" disabled={category._count.items > 0}>Hapus</button></form></article>)}</div>}</section>
    </div>
  );
}
