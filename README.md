# My Sekolah

SaaS manajemen sekolah multi-tenant untuk mengelola banyak sekolah dari satu platform pusat.

## Area aplikasi V1

1. **Platform Admin** — membuat, memantau, mengaktifkan, menangguhkan, dan mengarsipkan tenant sekolah.
2. **School Application** — operasional admin sekolah, guru, wali kelas, bendahara, dan kepala sekolah.
3. **Parent Portal** — akses orang tua terhadap anak, absensi, tagihan, pembayaran, kuitansi, dan pengumuman.

## Fokus V1

- Multi-tenancy dan isolasi data per sekolah
- Authentication, server-side RBAC, dan audit log
- Onboarding sekolah, tahun ajaran, semester, kelas, pengguna, dan undangan
- Siswa, wali, enrollment, import/export Excel
- Absensi harian dan rekap
- Tagihan, pembayaran sebagian, kuitansi, dan tunggakan
- Pengumuman dan portal orang tua
- Paket, trial, limit, suspend, archive, serta controlled impersonation

Dokumen ruang lingkup lengkap tersedia di [`docs/product-v1.md`](docs/product-v1.md).

## Stack awal

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma atau Drizzle (diputuskan pada fase database)

## Menjalankan proyek

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

## Status

Repository sedang berada pada fase bootstrap fondasi V1.
