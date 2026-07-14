import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { createClassGroup, createGradeLevel, toggleClassGroup, toggleGradeLevel } from "./actions";

const errorMessages: Record<string, string> = {
  "invalid-grade": "Data tingkat kelas belum valid.",
  "duplicate-grade": "Kode atau nama tingkat kelas sudah digunakan.",
  "invalid-class": "Data rombongan belajar belum valid.",
  "reference-not-found": "Tahun ajaran atau tingkat kelas tidak ditemukan.",
  "duplicate-class": "Nama rombel tersebut sudah digunakan pada tahun ajaran yang dipilih.",
};

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");

  const [gradeLevels, academicYears, classGroups, params] = await Promise.all([
    prisma.gradeLevel.findMany({
      where: { schoolId: session.user.schoolId },
      include: { _count: { select: { classGroups: true } } },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
    prisma.academicYear.findMany({
      where: { schoolId: session.user.schoolId },
      orderBy: { startDate: "desc" },
    }),
    prisma.classGroup.findMany({
      where: { schoolId: session.user.schoolId },
      include: { academicYear: true, gradeLevel: true },
      orderBy: [{ academicYear: { startDate: "desc" } }, { gradeLevel: { order: "asc" } }, { name: "asc" }],
    }),
    searchParams,
  ]);

  const activeYear = academicYears.find((year) => year.isActive);
  const activeClassGroups = classGroups.filter((group) => group.isActive);

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Struktur akademik</span>
          <h1>Tingkat Kelas & Rombongan Belajar</h1>
          <p>Susun tingkat kelas sekolah dan rombel per tahun ajaran sebagai dasar penempatan siswa dan wali kelas.</p>
        </div>
      </header>

      {params.error ? <section className="panel section-panel"><strong>Gagal:</strong> {errorMessages[params.error] ?? "Terjadi kesalahan."}</section> : null}
      {params.success ? <section className="panel section-panel"><strong>Berhasil:</strong> Data struktur kelas sudah disimpan.</section> : null}

      <section className="stats-grid">
        <article><span>Tahun ajaran aktif</span><strong>{activeYear?.name ?? "Belum ada"}</strong></article>
        <article><span>Tingkat aktif</span><strong>{gradeLevels.filter((item) => item.isActive).length}</strong></article>
        <article><span>Rombel aktif</span><strong>{activeClassGroups.length}</strong></article>
        <article><span>Total kapasitas</span><strong>{activeClassGroups.reduce((total, group) => total + group.capacity, 0)}</strong></article>
      </section>

      <section className="panel section-panel">
        <h2>Tambah Tingkat Kelas</h2>
        <form action={createGradeLevel} className="admin-form">
          <label>Kode<input name="code" placeholder="7 atau XI-RPL" required /></label>
          <label>Nama<input name="name" placeholder="Kelas 7 atau XI RPL" required /></label>
          <label>Urutan<input type="number" name="order" min="1" max="100" placeholder="1" required /></label>
          <button type="submit" className="primary-button">Simpan Tingkat</button>
        </form>
      </section>

      <section className="panel section-panel">
        <h2>Tambah Rombongan Belajar</h2>
        {academicYears.length === 0 || gradeLevels.filter((item) => item.isActive).length === 0 ? (
          <p>Buat tahun ajaran dan tingkat kelas aktif terlebih dahulu.</p>
        ) : (
          <form action={createClassGroup} className="admin-form">
            <label>Tahun ajaran
              <select name="academicYearId" required defaultValue={activeYear?.id ?? ""}>
                <option value="" disabled>Pilih tahun ajaran</option>
                {academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isActive ? " · Aktif" : ""}</option>)}
              </select>
            </label>
            <label>Tingkat
              <select name="gradeLevelId" required defaultValue="">
                <option value="" disabled>Pilih tingkat</option>
                {gradeLevels.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>Nama rombel<input name="name" placeholder="7A atau XI RPL 1" required /></label>
            <label>Kapasitas<input type="number" name="capacity" min="1" max="200" defaultValue="36" required /></label>
            <button type="submit" className="primary-button">Simpan Rombel</button>
          </form>
        )}
      </section>

      <section className="panel section-panel">
        <h2>Daftar Tingkat Kelas</h2>
        {gradeLevels.length === 0 ? <p>Belum ada tingkat kelas.</p> : (
          <div className="stats-grid">
            {gradeLevels.map((item) => (
              <article key={item.id}>
                <span>{item.code}</span>
                <strong>{item.name}</strong>
                <p>Urutan {item.order} · {item._count.classGroups} rombel · {item.isActive ? "Aktif" : "Nonaktif"}</p>
                <form action={toggleGradeLevel}>
                  <input type="hidden" name="gradeLevelId" value={item.id} />
                  <button type="submit" className="secondary-button">{item.isActive ? "Nonaktifkan" : "Aktifkan"}</button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel section-panel">
        <h2>Daftar Rombongan Belajar</h2>
        {classGroups.length === 0 ? <p>Belum ada rombongan belajar.</p> : (
          <div className="stats-grid">
            {classGroups.map((group) => (
              <article key={group.id}>
                <span>{group.academicYear.name} · {group.gradeLevel.name}</span>
                <strong>{group.name}</strong>
                <p>Kapasitas {group.capacity} siswa · {group.isActive ? "Aktif" : "Nonaktif"}</p>
                <form action={toggleClassGroup}>
                  <input type="hidden" name="classGroupId" value={group.id} />
                  <button type="submit" className="secondary-button">{group.isActive ? "Nonaktifkan" : "Aktifkan"}</button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}