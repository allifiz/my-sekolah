import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { deleteFeeCategory } from "./actions";

const errors: Record<string, string> = {
  "invalid-request": "Permintaan hapus tidak valid.",
  "not-found": "Kategori biaya tidak ditemukan.",
  "category-in-use": "Kategori sudah digunakan pada invoice dan tidak boleh dihapus.",
};

export default async function FeeCategoriesPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const member = await prisma.schoolMember.findFirst({ where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal", "finance"] } } } } }, select: { id: true } });
  if (!member) redirect("/school?error=forbidden");
  const [categories, params] = await Promise.all([
    prisma.feeCategory.findMany({ where: { schoolId: session.user.schoolId }, include: { _count: { select: { invoiceItems: true } } }, orderBy: { name: "asc" } }),
    searchParams,
  ]);
  return (
    <div className="admin-page">
      <header className="page-header"><div><span className="eyebrow">Keuangan sekolah</span><h1>Kategori Biaya</h1><p>Hapus kategori yang salah selama belum pernah digunakan pada invoice.</p></div><Link href="/school/finance" className="secondary-button">Kembali ke Keuangan</Link></header>
      {params.error ? <section className="panel section-panel"><strong>Gagal:</strong> {errors[params.error] ?? "Terjadi kesalahan."}</section> : null}
      {params.success ? <section className="panel section-panel"><strong>Berhasil:</strong> Kategori biaya sudah dihapus.</section> : null}
      <section className="panel section-panel"><h2>Daftar Kategori</h2>{categories.length === 0 ? <p>Belum ada kategori biaya.</p> : <div className="management-grid">{categories.map((category) => <article className="management-card" key={category.id}><div className="management-card-head"><div><strong>{category.code} · {category.name}</strong><p>{category.description ?? "Tanpa deskripsi"}</p></div><span>{category._count.invoiceItems} penggunaan</span></div><form action={deleteFeeCategory}><input type="hidden" name="feeCategoryId" value={category.id} /><button type="submit" className="secondary-button" disabled={category._count.invoiceItems > 0}>Hapus</button></form></article>)}</div>}</section>
    </div>
  );
}
