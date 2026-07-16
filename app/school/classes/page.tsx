import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ConfirmAction } from "@/components/confirm-action";
import { ModalForm } from "@/components/modal-form";
import { prisma } from "@/lib/prisma";

import { createClassGroup, createGradeLevel, toggleClassGroup, toggleGradeLevel } from "./actions";
import { deleteClassGroup, deleteGradeLevel } from "./delete-actions";

const errorMessages: Record<string, string> = {
  "invalid-grade": "Data tingkat kelas belum valid.",
  "duplicate-grade": "Kode atau nama tingkat kelas sudah digunakan.",
  "invalid-class": "Data rombongan belajar belum valid.",
  "reference-not-found": "Tahun ajaran atau tingkat kelas tidak ditemukan.",
  "duplicate-class": "Nama rombel tersebut sudah digunakan pada tahun ajaran yang dipilih.",
  "invalid-request": "Permintaan hapus tidak valid.",
  "not-found": "Data struktur kelas tidak ditemukan.",
  "grade-in-use": "Tingkat kelas masih digunakan oleh rombel. Hapus rombel terkait terlebih dahulu.",
  "class-in-use": "Rombel sudah memiliki enrollment, wali kelas, atau absensi sehingga tidak boleh dihapus. Nonaktifkan saja.",
};

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");

  const [gradeLevels, academicYears, classGroups, params] = await Promise.all([
    prisma.gradeLevel.findMany({ where: { schoolId: session.user.schoolId }, include: { _count: { select: { classGroups: true } } }, orderBy: [{ order: "asc" }, { name: "asc" }] }),
    prisma.academicYear.findMany({ where: { schoolId: session.user.schoolId }, orderBy: { startDate: "desc" } }),
    prisma.classGroup.findMany({
      where: { schoolId: session.user.schoolId },
      include: { academicYear: true, gradeLevel: true, _count: { select: { enrollments: true, homeroomAssignments: true, attendanceSessions: true } } },
      orderBy: [{ academicYear: { startDate: "desc" } }, { gradeLevel: { order: "asc" } }, { name: "asc" }],
    }),
    searchParams,
  ]);

  const activeYear = academicYears.find((year) => year.isActive);
  const activeGrades = gradeLevels.filter((item) => item.isActive);
  const activeClassGroups = classGroups.filter((group) => group.isActive);

  return (
    <div className="admin-page">
      <header className="page-header">
        <div><span className="eyebrow">Struktur akademik</span><h1>Tingkat & Rombongan Belajar</h1><p>Buat tingkat terlebih dahulu, lalu tempatkan rombel pada tahun ajaran yang tepat.</p></div>
        <div className="button-row">
          <ModalForm action={createGradeLevel} title="Tambah Tingkat Kelas" description="Tingkat bersifat lintas tahun ajaran, misalnya Kelas 7 atau XI RPL." triggerLabel="Tambah Tingkat" submitLabel="Simpan Tingkat">
            <label>Kode<input name="code" placeholder="7 atau XI-RPL" required /></label>
            <label>Nama<input name="name" placeholder="Kelas 7 atau XI RPL" required /></label>
            <label>Urutan<input type="number" name="order" min="1" max="100" placeholder="1" required /></label>
          </ModalForm>
          {academicYears.length > 0 && activeGrades.length > 0 ? (
            <ModalForm action={createClassGroup} title="Tambah Rombongan Belajar" description="Pastikan tahun ajaran dan tingkat sudah benar sebelum menyimpan." triggerLabel="Tambah Rombel" triggerClassName="secondary-button" submitLabel="Simpan Rombel">
              <label>Tahun ajaran<select name="academicYearId" required defaultValue={activeYear?.id ?? ""}><option value="" disabled>Pilih tahun ajaran</option>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isActive ? " · Aktif" : ""}</option>)}</select></label>
              <label>Tingkat<select name="gradeLevelId" required defaultValue=""><option value="" disabled>Pilih tingkat</option>{activeGrades.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <div className="form-grid"><label>Nama rombel<input name="name" placeholder="7A atau XI RPL 1" required /></label><label>Kapasitas<input type="number" name="capacity" min="1" max="200" defaultValue="36" required /></label></div>
              <p className="inline-note">Rombel yang sudah memiliki siswa, wali kelas, atau absensi tidak dapat dihapus permanen.</p>
            </ModalForm>
          ) : null}
        </div>
      </header>

      {params.error ? <section className="panel section-panel"><strong>Gagal:</strong> {errorMessages[params.error] ?? "Terjadi kesalahan."}</section> : null}
      {params.success ? <section className="panel section-panel"><strong>Berhasil:</strong> Data struktur kelas sudah disimpan.</section> : null}
      {academicYears.length === 0 || activeGrades.length === 0 ? <section className="panel section-panel inline-note">Untuk membuat rombel, siapkan minimal satu tahun ajaran dan satu tingkat aktif.</section> : null}

      <section className="stats-grid"><article><span>Tahun ajaran aktif</span><strong>{activeYear?.name ?? "Belum ada"}</strong></article><article><span>Tingkat aktif</span><strong>{activeGrades.length}</strong></article><article><span>Rombel aktif</span><strong>{activeClassGroups.length}</strong></article><article><span>Total kapasitas</span><strong>{activeClassGroups.reduce((total, group) => total + group.capacity, 0)}</strong></article></section>

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Tingkat Kelas</h2><p>Nonaktifkan untuk menyembunyikan dari pilihan baru; hapus hanya jika belum pernah dipakai.</p></div></div>
        {gradeLevels.length === 0 ? <div className="empty-state"><strong>Belum ada tingkat kelas</strong></div> : <div className="context-list">{gradeLevels.map((item) => <article key={item.id} className="context-card"><div className="context-card-head"><div><span>{item.code}</span><h3>{item.name}</h3><p>Urutan {item.order} · {item._count.classGroups} rombel · {item.isActive ? "Aktif" : "Nonaktif"}</p></div><div className="button-row"><ConfirmAction action={toggleGradeLevel} title={`${item.isActive ? "Nonaktifkan" : "Aktifkan"} ${item.name}?`} description={item.isActive ? "Tingkat ini tidak lagi muncul saat membuat rombel baru. Data lama tetap tersimpan." : "Tingkat ini akan kembali tersedia untuk rombel baru."} triggerLabel={item.isActive ? "Nonaktifkan" : "Aktifkan"} confirmLabel={item.isActive ? "Ya, nonaktifkan" : "Ya, aktifkan"} confirmClassName="primary-button"><input type="hidden" name="gradeLevelId" value={item.id} /></ConfirmAction><ConfirmAction action={deleteGradeLevel} title={`Hapus ${item.name}?`} description="Tingkat akan dihapus permanen dan tidak dapat dipulihkan." triggerLabel="Hapus" disabled={item._count.classGroups > 0}><input type="hidden" name="gradeLevelId" value={item.id} /></ConfirmAction></div></div>{item._count.classGroups > 0 ? <p className="inline-note">Tidak dapat dihapus karena masih memiliki rombel.</p> : null}</article>)}</div>}
      </section>

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Rombongan Belajar</h2><p>Aksi status dan hapus menampilkan dampaknya sebelum dijalankan.</p></div></div>
        {classGroups.length === 0 ? <div className="empty-state"><strong>Belum ada rombongan belajar</strong></div> : <div className="context-list">{classGroups.map((group) => { const used = group._count.enrollments + group._count.homeroomAssignments + group._count.attendanceSessions > 0; return <article key={group.id} className="context-card"><div className="context-card-head"><div><span>{group.academicYear.name} · {group.gradeLevel.name}</span><h3>{group.name}</h3><p>Kapasitas {group.capacity} · {group._count.enrollments} enrollment · {group._count.homeroomAssignments} wali kelas · {group._count.attendanceSessions} sesi absensi</p></div><div className="button-row"><ConfirmAction action={toggleClassGroup} title={`${group.isActive ? "Nonaktifkan" : "Aktifkan"} rombel ${group.name}?`} description={group.isActive ? "Rombel tidak akan tersedia untuk enrollment baru, tetapi histori tetap ada." : "Rombel akan tersedia kembali untuk enrollment baru."} triggerLabel={group.isActive ? "Nonaktifkan" : "Aktifkan"} confirmLabel={group.isActive ? "Ya, nonaktifkan" : "Ya, aktifkan"} confirmClassName="primary-button"><input type="hidden" name="classGroupId" value={group.id} /></ConfirmAction><ConfirmAction action={deleteClassGroup} title={`Hapus rombel ${group.name}?`} description="Rombel akan dihapus permanen. Ini hanya aman untuk data yang dibuat karena salah input dan belum digunakan." triggerLabel="Hapus" disabled={used}><input type="hidden" name="classGroupId" value={group.id} /></ConfirmAction></div></div>{used ? <p className="inline-note">Sudah dipakai; gunakan Nonaktifkan, bukan Hapus.</p> : null}</article>; })}</div>}
      </section>
    </div>
  );
}
