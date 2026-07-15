import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { createBulkInvoices } from "../actions";

function dateInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default async function BulkInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; count?: string }>;
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

  const [params, categories, classGroups] = await Promise.all([
    searchParams,
    prisma.feeCategory.findMany({ where: { schoolId: session.user.schoolId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.classGroup.findMany({
      where: { schoolId: session.user.schoolId, isActive: true },
      include: {
        academicYear: true,
        gradeLevel: true,
        _count: { select: { enrollments: { where: { status: "ACTIVE", student: { status: "ACTIVE", deletedAt: null } } } } },
      },
      orderBy: [{ academicYear: { startDate: "desc" } }, { gradeLevel: { order: "asc" } }, { name: "asc" }],
    }),
  ]);

  const nextMonth = new Date();
  nextMonth.setDate(nextMonth.getDate() + 30);
  const errorMessages: Record<string, string> = {
    "invalid-invoice": "Data invoice massal belum valid.",
    "reference-not-found": "Rombel atau kategori tagihan tidak ditemukan.",
    "no-students": "Rombel tidak memiliki siswa aktif.",
    "all-duplicate": "Semua siswa sudah memiliki tagihan dengan judul dan tanggal terbit yang sama.",
  };

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Keuangan sekolah</span>
          <h1>Invoice Massal per Rombel</h1>
          <p>Terbitkan tagihan yang sama untuk seluruh siswa aktif dalam satu rombel.</p>
        </div>
        <Link href="/school/finance">Kembali ke Keuangan</Link>
      </header>

      {params.error ? <section className="panel section-panel"><strong>Gagal:</strong> {errorMessages[params.error] ?? "Terjadi kesalahan."}</section> : null}
      {params.success ? <section className="panel section-panel"><strong>Berhasil:</strong> {params.count ?? "0"} invoice diterbitkan. Siswa dengan tagihan duplikat otomatis dilewati.</section> : null}

      <section className="panel section-panel">
        <h2>Terbitkan Tagihan Rombel</h2>
        {categories.length === 0 || classGroups.length === 0 ? <p>Buat kategori tagihan dan rombel aktif terlebih dahulu.</p> : (
          <form action={createBulkInvoices} className="admin-form">
            <label>Rombongan belajar
              <select name="classGroupId" required defaultValue="">
                <option value="" disabled>Pilih rombel</option>
                {classGroups.map((group) => <option key={group.id} value={group.id} disabled={group._count.enrollments === 0}>{group.academicYear.name} · {group.gradeLevel.name} · {group.name} · {group._count.enrollments} siswa</option>)}
              </select>
            </label>
            <label>Kategori
              <select name="feeCategoryId" required defaultValue="">
                <option value="" disabled>Pilih kategori</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.code} · {category.name}</option>)}
              </select>
            </label>
            <label>Judul tagihan<input name="title" placeholder="SPP Juli 2026" required /></label>
            <label>Nominal per siswa<input name="amount" inputMode="numeric" placeholder="500000" required /></label>
            <label>Tanggal terbit<input name="issueDate" type="date" defaultValue={dateInput()} required /></label>
            <label>Jatuh tempo<input name="dueDate" type="date" defaultValue={dateInput(nextMonth)} required /></label>
            <label>Catatan<textarea name="description" rows={3} /></label>
            <button type="submit" className="primary-button">Terbitkan Invoice Massal</button>
          </form>
        )}
      </section>
    </div>
  );
}
