import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { ConfirmAction } from "@/components/confirm-action";
import { ModalForm } from "@/components/modal-form";
import { prisma } from "@/lib/prisma";

import { activateSemester, createSemester } from "../actions";
import { deleteSemester } from "../delete-actions";

const errorMessages: Record<string, string> = {
  "invalid-semester": "Data semester belum valid.",
  "year-not-found": "Tahun ajaran tidak ditemukan.",
  "invalid-semester-range": "Tanggal semester harus berada di dalam rentang tahun ajaran.",
  "duplicate-semester": "Semester tersebut sudah tersedia.",
  "invalid-request": "Permintaan tidak valid.",
  "not-found": "Semester tidak ditemukan.",
  "active-period": "Semester aktif tidak dapat dihapus. Aktifkan semester lain terlebih dahulu.",
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(value);
}

function dateValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

export default async function AcademicYearDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ academicYearId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");

  const [{ academicYearId }, query] = await Promise.all([params, searchParams]);
  const year = await prisma.academicYear.findFirst({
    where: { id: academicYearId, schoolId: session.user.schoolId },
    include: {
      semesters: { orderBy: { startDate: "asc" } },
      _count: { select: { classGroups: true, enrollments: true } },
      classGroups: { select: { id: true, name: true }, orderBy: { name: "asc" }, take: 8 },
    },
  });
  if (!year) notFound();

  const returnTo = `/school/academic/${year.id}`;
  const hasOdd = year.semesters.some((semester) => semester.type === "ODD");
  const hasEven = year.semesters.some((semester) => semester.type === "EVEN");

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <Link href="/school/academic" className="table-link">← Semua Tahun Ajaran</Link>
          <span className="eyebrow">Detail tahun ajaran</span>
          <h1>{year.name}</h1>
          <p>{formatDate(year.startDate)} – {formatDate(year.endDate)} · {year.isActive ? "Aktif" : "Tidak aktif"}</p>
        </div>
        <ModalForm action={createSemester} title={`Tambah Semester · ${year.name}`} description="Semester otomatis ditempatkan pada tahun ajaran ini agar tidak salah konteks." triggerLabel="Tambah Semester" submitLabel="Buat Semester">
          <input type="hidden" name="academicYearId" value={year.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label>Semester
            <select name="type" required defaultValue={hasOdd && !hasEven ? "EVEN" : "ODD"}>
              <option value="ODD" disabled={hasOdd}>Ganjil{hasOdd ? " · sudah dibuat" : ""}</option>
              <option value="EVEN" disabled={hasEven}>Genap{hasEven ? " · sudah dibuat" : ""}</option>
            </select>
          </label>
          <div className="form-grid">
            <label>Tanggal mulai<input type="date" name="startDate" min={dateValue(year.startDate)} max={dateValue(year.endDate)} required /></label>
            <label>Tanggal selesai<input type="date" name="endDate" min={dateValue(year.startDate)} max={dateValue(year.endDate)} required /></label>
          </div>
          <label><input type="checkbox" name="isActive" /> Jadikan semester aktif</label>
          <p className="inline-note">Mengaktifkan semester ini akan menonaktifkan semester aktif sebelumnya dan mengaktifkan tahun ajaran {year.name}.</p>
        </ModalForm>
      </header>

      {query.error ? <section className="panel section-panel"><strong>Gagal:</strong> {errorMessages[query.error] ?? "Terjadi kesalahan."}</section> : null}
      {query.success ? <section className="panel section-panel"><strong>Berhasil:</strong> Data semester sudah diperbarui.</section> : null}

      <section className="stats-grid">
        <article><span>Status</span><strong>{year.isActive ? "Aktif" : "Tidak aktif"}</strong></article>
        <article><span>Semester</span><strong>{year.semesters.length}/2</strong></article>
        <article><span>Rombel</span><strong>{year._count.classGroups}</strong></article>
        <article><span>Enrollment</span><strong>{year._count.enrollments}</strong></article>
      </section>

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Semester</h2><p>Aktivasi memengaruhi periode operasional sekolah. Penghapusan hanya tersedia untuk semester nonaktif.</p></div></div>
        {year.semesters.length === 0 ? <div className="empty-state"><strong>Belum ada semester</strong><p>Tambahkan semester pertama melalui tombol di atas.</p></div> : (
          <div className="context-list">
            {year.semesters.map((semester) => (
              <article key={semester.id} className="context-card">
                <div className="context-card-head">
                  <div>
                    <span className={`status-badge ${semester.isActive ? "status-active" : ""}`}>{semester.isActive ? "Aktif" : "Tidak aktif"}</span>
                    <h3>Semester {semester.name}</h3>
                    <p>{formatDate(semester.startDate)} – {formatDate(semester.endDate)}</p>
                  </div>
                  <div className="button-row">
                    {!semester.isActive ? (
                      <ConfirmAction action={activateSemester} title={`Aktifkan semester ${semester.name}?`} description="Semester aktif saat ini akan dinonaktifkan dan seluruh transaksi baru akan mengikuti semester ini." triggerLabel="Aktifkan" confirmLabel="Ya, aktifkan" confirmClassName="primary-button">
                        <input type="hidden" name="semesterId" value={semester.id} />
                      </ConfirmAction>
                    ) : null}
                    <ConfirmAction action={deleteSemester} title={`Hapus semester ${semester.name}?`} description="Semester akan dihapus permanen. Pastikan semester ini dibuat karena salah input dan belum digunakan." triggerLabel="Hapus" disabled={semester.isActive}>
                      <input type="hidden" name="semesterId" value={semester.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                    </ConfirmAction>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Rombel pada Tahun Ini</h2><p>Konteks pemakaian membantu admin memahami mengapa tahun ajaran tidak dapat dihapus.</p></div><Link href="/school/classes" className="secondary-button">Kelola Rombel</Link></div>
        {year.classGroups.length === 0 ? <p>Belum ada rombel pada tahun ajaran ini.</p> : <div className="context-list">{year.classGroups.map((group) => <div key={group.id} className="context-card"><strong>{group.name}</strong></div>)}</div>}
      </section>
    </div>
  );
}
