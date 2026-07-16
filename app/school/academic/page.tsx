import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { activateAcademicYear, activateSemester, createAcademicYear, createSemester } from "./actions";
import { deleteAcademicYear, deleteSemester } from "./delete-actions";

const errorMessages: Record<string, string> = {
  "invalid-year": "Data tahun ajaran belum valid.",
  "invalid-year-range": "Tanggal selesai tahun ajaran harus setelah tanggal mulai.",
  "duplicate-year": "Nama tahun ajaran tersebut sudah digunakan.",
  "invalid-semester": "Data semester belum valid.",
  "year-not-found": "Tahun ajaran tidak ditemukan.",
  "invalid-semester-range": "Rentang semester harus berada di dalam tahun ajaran.",
  "duplicate-semester": "Semester tersebut sudah tersedia pada tahun ajaran ini.",
  "invalid-request": "Permintaan hapus tidak valid.",
  "not-found": "Periode akademik tidak ditemukan.",
  "active-period": "Periode aktif tidak dapat dihapus. Aktifkan periode lain terlebih dahulu.",
  "year-in-use": "Tahun ajaran sudah digunakan oleh rombel atau enrollment sehingga tidak boleh dihapus.",
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
      <header className="page-header"><div><span className="eyebrow">Fondasi akademik</span><h1>Tahun Ajaran & Semester</h1><p>Atur periode akademik aktif yang akan menjadi dasar kelas, jadwal, absensi, dan penilaian.</p></div></header>
      {params.error ? <section className="panel section-panel"><strong>Gagal:</strong> {errorMessages[params.error] ?? "Terjadi kesalahan."}</section> : null}
      {params.success ? <section className="panel section-panel"><strong>Berhasil:</strong> Data akademik sudah disimpan.</section> : null}
      <section className="stats-grid"><article><span>Tahun ajaran aktif</span><strong>{activeYear?.name ?? "Belum ada"}</strong></article><article><span>Semester aktif</span><strong>{activeSemester?.name ?? "Belum ada"}</strong></article><article><span>Total tahun ajaran</span><strong>{years.length}</strong></article><article><span>Total semester</span><strong>{years.reduce((total, year) => total + year.semesters.length, 0)}</strong></article></section>
      <section className="panel section-panel"><h2>Tambah Tahun Ajaran</h2><form action={createAcademicYear} className="admin-form"><label>Nama<input name="name" placeholder="2026/2027" required /></label><label>Tanggal mulai<input type="date" name="startDate" required /></label><label>Tanggal selesai<input type="date" name="endDate" required /></label><label><input type="checkbox" name="isActive" /> Jadikan tahun ajaran aktif</label><button type="submit" className="primary-button">Simpan Tahun Ajaran</button></form></section>
      <section className="panel section-panel"><h2>Tambah Semester</h2>{years.length === 0 ? <p>Buat tahun ajaran terlebih dahulu.</p> : <form action={createSemester} className="admin-form"><label>Tahun ajaran<select name="academicYearId" required defaultValue=""><option value="" disabled>Pilih tahun ajaran</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label><label>Semester<select name="type" required defaultValue="ODD"><option value="ODD">Ganjil</option><option value="EVEN">Genap</option></select></label><label>Tanggal mulai<input type="date" name="startDate" required /></label><label>Tanggal selesai<input type="date" name="endDate" required /></label><label><input type="checkbox" name="isActive" /> Jadikan semester aktif</label><button type="submit" className="primary-button">Simpan Semester</button></form>}</section>
      <section className="panel section-panel"><h2>Daftar Periode Akademik</h2>{years.length === 0 ? <p>Belum ada tahun ajaran.</p> : years.map((year) => { const yearUsed = year._count.classGroups + year._count.enrollments > 0; return <article key={year.id} className="panel section-panel"><div className="page-header"><div><h3>{year.name} {year.isActive ? "· Aktif" : ""}</h3><p>{formatDate(year.startDate)} – {formatDate(year.endDate)}</p></div><div className="button-row">{!year.isActive ? <form action={activateAcademicYear}><input type="hidden" name="academicYearId" value={year.id} /><button type="submit" className="secondary-button">Aktifkan</button></form> : null}<form action={deleteAcademicYear}><input type="hidden" name="academicYearId" value={year.id} /><button type="submit" className="secondary-button" disabled={year.isActive || yearUsed || year.semesters.some((semester) => semester.isActive)}>Hapus Tahun</button></form></div></div>{year.semesters.length === 0 ? <p>Belum ada semester.</p> : <div className="stats-grid">{year.semesters.map((semester) => <article key={semester.id}><span>{semester.name}</span><strong>{semester.isActive ? "Aktif" : semester.type}</strong><p>{formatDate(semester.startDate)} – {formatDate(semester.endDate)}</p><div className="button-row">{!semester.isActive ? <form action={activateSemester}><input type="hidden" name="semesterId" value={semester.id} /><button type="submit" className="secondary-button">Aktifkan Semester</button></form> : null}<form action={deleteSemester}><input type="hidden" name="semesterId" value={semester.id} /><button type="submit" className="secondary-button" disabled={semester.isActive}>Hapus</button></form></div></article>)}</div>}</article>; })}</section>
    </div>
  );
}
