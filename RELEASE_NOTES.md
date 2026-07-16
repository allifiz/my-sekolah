# My Sekolah V1.0.0

Tanggal rilis: 16 Juli 2026

## Ringkasan

My Sekolah V1 menyediakan fondasi SaaS sekolah multi-tenant untuk pengelolaan akademik, siswa, wali, absensi, keuangan, komunikasi, akses staf, portal wali, audit, dan operasional platform.

## Fitur utama

- Tenant sekolah dengan status trial, aktif, lewat jatuh tempo, ditangguhkan, dibatalkan, dan diarsipkan.
- Manajemen anggota, undangan staf, status akses, serta perubahan role aktif.
- Tahun ajaran, semester, jenjang, rombel, wali kelas, siswa, wali, dan enrollment.
- Absensi harian, koreksi, laporan, dan ekspor.
- Kategori biaya, invoice massal, pembayaran, alokasi, kuitansi, laporan, dan ekspor.
- Pengumuman sekolah dan feed pengguna.
- Portal wali dengan relasi siswa, absensi, tagihan, dan pengumuman.
- Dashboard sekolah dan dashboard kesehatan tenant platform.
- Audit log sekolah dan pencatatan aksi sensitif.
- Penggantian password mandiri untuk akun berbasis password.
- Kebijakan privasi dan ketentuan layanan.

## Keamanan dan operasional

- Tenant boundary dan role policy diuji melalui unit test yang berjalan pada build production.
- Subscription dan trial expiry diberlakukan saat autentikasi.
- School Owner terakhir dilindungi dari penonaktifan.
- Perubahan status, role, password, undangan, transaksi, dan aksi penting dicatat dalam audit log.
- Production build tidak menjalankan seed atau reset password otomatis.
- Database baru dapat dibangun melalui `npm run db:bootstrap:fresh`.

## Catatan deployment

Untuk database production yang sudah berjalan, gunakan `npm run db:deploy`.
Untuk instalasi database kosong, gunakan `npm run db:bootstrap:fresh`, lalu jalankan seed secara eksplisit hanya bila diperlukan.

## Batasan V1

- GitHub Actions CI eksternal dinonaktifkan sementara; unit test dan production build tetap dijalankan oleh Vercel.
- Layanan email bergantung pada konfigurasi penyedia email.
- Backup dan point-in-time restore mengikuti kemampuan penyedia PostgreSQL yang digunakan.
