# Database Bootstrap

Dokumen ini menjelaskan cara menyiapkan PostgreSQL dan Prisma untuk My Sekolah.

## Prasyarat

- Node.js sesuai `package.json`
- PostgreSQL lokal atau managed PostgreSQL
- File `.env` berdasarkan `.env.example`

## Setup lokal

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:validate
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

Migration pertama harus dibuat setelah `DATABASE_URL` menunjuk ke database development yang dapat diakses.

## Seed awal

Seed membuat:

- satu Platform Owner dari `SEED_PLATFORM_OWNER_EMAIL`
- satu tenant demo bernama Sekolah Demo Nusantara
- konfigurasi sekolah bawaan
- role sistem sekolah
- permission sistem sekolah
- membership owner pada tenant demo
- audit log awal

Seed dibuat idempotent untuk entitas utama sehingga dapat dijalankan ulang. Relasi role-permission akan disinkronkan dengan definisi di `prisma/seed.ts`.

## Role sekolah bawaan

- School Owner
- School Admin
- Kepala Sekolah
- Bendahara
- Guru
- Wali Kelas
- Orang Tua/Wali

## Production dan Vercel

Gunakan database production terpisah dari development dan preview.

```bash
npm run db:deploy
```

`db:deploy` menjalankan migration yang sudah tersimpan tanpa membuat migration baru. Jangan menjalankan `prisma migrate dev` terhadap database production.

Environment minimum di Vercel:

```text
DATABASE_URL
```

`SEED_PLATFORM_OWNER_EMAIL` dan `SEED_PLATFORM_OWNER_NAME` hanya diperlukan ketika seed memang dijalankan. Jangan menjalankan seed demo otomatis pada setiap deployment production.

## Aturan migration

1. Perubahan schema dibuat di branch pengembangan.
2. Jalankan `npm run db:migrate -- --name <nama_migration>` terhadap database development.
3. Commit folder `prisma/migrations` yang dihasilkan.
4. CI memvalidasi schema dan build.
5. Production menjalankan `npm run db:deploy`.
6. Perubahan destruktif harus menggunakan strategi bertahap dan backup terlebih dahulu.
