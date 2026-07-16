import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ConfirmAction } from "@/components/confirm-action";
import { ModalForm } from "@/components/modal-form";
import { prisma } from "@/lib/prisma";

import { activateAcademicYear, createAcademicYear } from "./actions";
import { deleteAcademicYear } from "./delete-actions";

const errorMessages: Record<string, string> = {
  "invalid-year": "Data tahun ajaran belum valid.",
  "invalid-year-range": "Tanggal selesai harus setelah tanggal mulai.",
  "duplicate-year": "Nama tahun ajaran tersebut sudah digunakan.",
  "invalid-request": "Permintaan hapus tidak valid.",
  "not-found": "Tahun ajaran tidak ditemukan.",
  "year-in-use": "Tahun ajaran sudah dipakai oleh rombel atau enrollment dan tidak dapat dihapus.",
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(value);
}

export default async function AcademicPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");

  const [years, params] = await Promise.all([
    prisma.academicYear.findMany({
      where: { schoolId: session.user.schoolId },
      include: { semesters: { orderBy: { startDate: "asc" } }, _count: { select: { classGroups: true, enrollments: true } } },
      orderBy: { startDate: "desc" },
    }),
    searchParams,
  ]);

  const activeYear = years.find((year) => year.isActive);
  const activeSemester = years.flatMap((year) => year.semesters).find((semester) => semester.isActive);

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Fondasi akademik</span>
          <h1>Tahun Ajaran</h1>
          <p>Pilih satu tahun ajaran untuk mengelola semester di dalamnya. Struktur ini mencegah semester dibuat pada periode yang salah.</p>
        </div>
        <ModalForm action={createAcademicYear} title="Buat Tahun Ajaran" description="Tanggal semester nantinya harus berada di dalam rentang ini." triggerLabel="Tambah Tahun Ajaran" submitLabel="Buat Tahun Ajaran">
          <label>Nama<input name="name" placeholder="2026/2027" required /></label>
          <div className="form-grid">
            <label>Tanggal mulai<input type="date" name="startDate" required /></label>
            <label>Tanggal selesai<input type="date" name="endDate" required /></label>
          </div>
          <label><input type="checkbox" name="isActive" /> Jadikan tahun ajaran aktif</label>
          <p className="inline-note">Jika diaktifkan, tahun ajaran dan semester aktif sebelumnya akan dinonaktifkan.</p>
        </ModalForm>
      </header>

      {params.error ? <section className="panel section-panel"><strong>Gagal:</strong> {errorMessages[params.error] ?? "Terjadi kesalahan."}</section> : null}
      {params.success ? <section className="panel section-panel"><strong>Berhasil:</strong> Perubahan periode akademik sudah disimpan.</section> : null}

      <section className="stats-grid">
        <article><span>Tahun ajaran aktif</span><strong>{activeYear?.name ?? "Belum ada"}</strong></article>
        <article><span>Semester aktif</span><strong>{activeSemester?.name ?? "Belum ada"}</strong></article>
        <article><span>Total tahun ajaran</span><strong>{years.length}</strong></article>
        <article><span>Total semester</span><strong>{years.reduce((total, year) => total + year.semesters.length, 0)}</strong></article>
      </section>

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Daftar Tahun Ajaran</h2><p>Klik kartu untuk membuka semester dan detail penggunaannya.</p></div></div>
        {years.length === 0 ? <div className="empty-state"><strong>Belum ada tahun ajaran</strong><p>Tambahkan periode pertama melalui tombol di atas.</p></div> : (
          <div className="context-list">
            {years.map((year) => {
              const yearUsed = year._count.classGroups + year._count.enrollments > 0;
              return (
                <article key={year.id} className="context-card">
                  <div className="context-card-head">
                    <Link href={`/school/academic/${year.id}`} aria-label={`Kelola tahun ajaran ${year.name}`}>
                      <span className={`status-badge ${year.isActive ? "status-active" : ""}`}>{year.isActive ? "Aktif" : "Tidak aktif"}</span>
                      <h3>{year.name}</h3>
                      <p>{formatDate(year.startDate)} – {formatDate(year.endDate)}</p>
                      <small>{year.semesters.length} semester · {year._count.classGroups} rombel · {year._count.enrollments} enrollment</small>
                    </Link>
                    <div className="button-row">
                      {!year.isActive ? (
                        <ConfirmAction action={activateAcademicYear} title={`Aktifkan ${year.name}?`} description="Tahun ajaran dan semester aktif saat ini akan dinonaktifkan." triggerLabel="Aktifkan" confirmLabel="Ya, aktifkan" confirmClassName="primary-button">
                          <input type="hidden" name="academicYearId" value={year.id} />
                        </ConfirmAction>
                      ) : null}
                      <ConfirmAction action={deleteAcademicYear} title={`Hapus tahun ajaran ${year.name}?`} description={year.semesters.length > 0 ? `Semua ${year.semesters.length} semester yang belum dipakai juga akan dihapus. Tindakan ini tidak dapat dibatalkan.` : "Tahun ajaran ini akan dihapus permanen. Tindakan ini tidak dapat dibatalkan."} triggerLabel="Hapus" disabled={yearUsed}>
                        <input type="hidden" name="academicYearId" value={year.id} />
                      </ConfirmAction>
                    </div>
                  </div>
                  {yearUsed ? <p className="inline-note">Tidak dapat dihapus karena sudah dipakai. Buka detail untuk melihat konteks semester dan penggunaan.</p> : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
