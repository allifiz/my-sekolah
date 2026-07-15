import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { ImportPreview } from "./import-preview";

const errorMessages: Record<string, string> = {
  "invalid-payload": "Payload import tidak dapat dibaca.",
  "invalid-rows": "Data import tidak valid atau melebihi 1.000 baris.",
  "invalid-date": "Terdapat tanggal lahir yang tidak valid.",
  "duplicate-file": "Terdapat NIS atau NISN duplikat di dalam file.",
  "duplicate-database": "Terdapat NIS atau NISN yang sudah tersimpan di sekolah.",
  "student-limit": "Import akan melewati batas jumlah siswa paket sekolah.",
};

export default async function StudentImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; count?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");
  const params = await searchParams;

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Data siswa</span>
          <h1>Import dan Export</h1>
          <p>Preview dan validasi setiap baris sebelum data siswa disimpan secara transaksional.</p>
        </div>
        <div>
          <Link href="/school/students/import/template" className="secondary-button">Unduh Template</Link>{" "}
          <Link href="/school/students/export" className="secondary-button">Export Siswa</Link>
        </div>
      </header>

      {params.error ? (
        <section className="panel section-panel"><strong>Gagal:</strong> {errorMessages[params.error] ?? "Terjadi kesalahan saat import."}</section>
      ) : null}
      {params.success === "imported" ? (
        <section className="panel section-panel"><strong>Berhasil:</strong> {params.count ?? "0"} siswa telah diimport.</section>
      ) : null}

      <section className="panel section-panel">
        <h2>Petunjuk</h2>
        <p>Jangan mengubah nama atau urutan kolom template. NIS dan nama wajib diisi. Gender menggunakan L atau P. Tanggal lahir menggunakan format YYYY-MM-DD.</p>
      </section>

      <section className="panel section-panel">
        <h2>Pilih File dan Preview</h2>
        <ImportPreview />
      </section>
    </div>
  );
}
