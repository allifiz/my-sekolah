# Vercel + Neon Development Database

Repository ini menggunakan Prisma dengan dua URL PostgreSQL:

- `DATABASE_URL`: koneksi pooled untuk runtime aplikasi/serverless.
- `DIRECT_URL`: koneksi langsung untuk migration Prisma.

## 1. Buat project Vercel

1. Buka dashboard Vercel pada team `syren`.
2. Import repository GitHub `allifiz/my-sekolah`.
3. Gunakan nama project `my-sekolah`.

## 2. Tambahkan Neon Postgres

1. Buka project `my-sekolah` di Vercel.
2. Masuk ke **Storage** atau **Marketplace**.
3. Pilih **Neon Postgres**.
4. Buat database development baru.
5. Hubungkan database ke project untuk environment Development dan Preview.
6. Pastikan environment variable pooled dan direct tersedia.

Mapping yang dibutuhkan aplikasi:

```text
DATABASE_URL = pooled connection string
DIRECT_URL   = direct/unpooled connection string
```

Nama variable bawaan provider dapat berbeda. Salin nilainya ke dua nama di atas melalui Project Settings → Environment Variables tanpa menaruh secret di GitHub.

## 3. Jalankan migration pertama

Setelah environment lokal sudah memiliki kedua URL:

```bash
npm install
npm run db:generate
npm run db:validate
npm run db:migrate -- --name init
npm run db:seed
```

Untuk production atau CI gunakan:

```bash
npm run db:deploy
```

Jangan menjalankan `prisma migrate dev` terhadap database production.

## 4. Verifikasi

```bash
npm run db:studio
```

Pastikan tabel berikut tersedia:

- `User`
- `PlatformMembership`
- `School`
- `SchoolSettings`
- `SchoolMember`
- `Role`
- `Permission`
- `RolePermission`
- `MemberRole`
- `Invitation`
- `AuditLog`
- `ImpersonationSession`

Seed juga harus membuat satu Platform Owner dan tenant demo.

## 5. Keamanan

- Jangan commit `.env` atau `.env.local`.
- Gunakan database/branch terpisah untuk Preview dan Production.
- Gunakan pooled URL pada runtime Vercel.
- Gunakan direct URL hanya untuk migration dan tooling.
