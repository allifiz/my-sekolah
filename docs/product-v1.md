# Product Scope V1 — My Sekolah

## 1. Visi Produk

My Sekolah adalah SaaS manajemen sekolah berbasis multi-tenant. Satu platform melayani banyak sekolah, tetapi setiap sekolah memiliki workspace, pengguna, konfigurasi, dan data yang terisolasi.

Tujuan V1 adalah membuat satu sekolah dapat menjalankan administrasi inti—data siswa, absensi, tagihan, pembayaran, kuitansi, dan komunikasi orang tua—sementara pemilik SaaS dapat mengelola seluruh tenant dari dashboard pusat.

## 2. Target Pengguna

Target awal adalah sekolah swasta TK–SMA dengan sekitar 100–1.000 siswa yang masih banyak menggunakan Excel, WhatsApp, dan pencatatan manual.

### Pengguna tingkat platform

- Platform Owner
- Platform Admin
- Support Agent
- Finance Admin

### Pengguna tingkat sekolah

- School Owner
- School Admin
- Kepala Sekolah
- Bendahara
- Guru
- Wali Kelas
- Orang Tua/Wali

Role platform dan role sekolah harus dipisahkan.

## 3. Area Aplikasi

### Platform Admin

Digunakan pemilik SaaS untuk:

- Membuat tenant sekolah
- Menetapkan admin sekolah pertama
- Mengatur paket, trial, limit siswa, dan limit pengguna
- Memantau jumlah sekolah, siswa, pengguna, serta aktivitas
- Mengubah status tenant: trial, active, past due, suspended, cancelled, archived
- Mengaktifkan kembali tenant
- Melakukan controlled impersonation untuk support
- Mengarsipkan dan menghapus tenant melalui masa retensi

### School Application

Digunakan sekolah untuk:

- Mengelola profil sekolah
- Tahun ajaran, semester, tingkat kelas, dan kelas
- Pengguna, undangan, role, dan permission
- Siswa, wali, hubungan siswa-wali, dan enrollment
- Import/export Excel
- Absensi dan rekap
- Jenis tagihan, tagihan massal, pembayaran, kuitansi, serta tunggakan
- Pengumuman

### Parent Portal

Digunakan orang tua untuk:

- Melihat daftar anak yang terhubung
- Melihat profil dan absensi anak
- Melihat tagihan dan riwayat pembayaran
- Mengunduh kuitansi
- Membaca pengumuman

## 4. Model Multi-Tenant

`schools` menjadi entitas tenant utama. Seluruh data bisnis sekolah wajib membawa `school_id` atau terhubung secara aman ke tenant.

Tenant isolation wajib diterapkan di server dan database, bukan hanya di UI.

Contoh aturan:

- Pengguna sekolah A tidak dapat membaca atau mengubah data sekolah B.
- Orang tua hanya dapat melihat siswa yang memiliki hubungan wali dengannya.
- Guru hanya dapat mengakses kelas sesuai penugasan dan permission.
- Platform support tidak mengubah data operasional tanpa impersonation yang tercatat.

## 5. Scope Fungsional V1

### Fondasi

- Login, logout, reset password, verifikasi email
- Session management
- Multi-tenancy
- Server-side RBAC
- Audit log
- Soft delete
- Error monitoring
- Backup database
- Responsive web/PWA

### Tenant dan Subscription

- CRUD sekolah
- Admin sekolah pertama
- Paket dan feature limit
- Trial
- Status tenant
- Suspend/reactivate
- Archive dan retention
- Controlled impersonation

### Struktur Sekolah

- Profil sekolah
- Tahun ajaran
- Semester
- Tingkat kelas
- Kelas
- Wali kelas
- Pengguna dan undangan

### Siswa dan Wali

- CRUD siswa
- Status siswa: active, graduated, transferred, inactive
- Data wali
- Banyak wali untuk satu siswa
- Banyak anak untuk satu wali
- Enrollment dan riwayat kelas
- Import Excel dengan preview dan validasi per baris
- Export data

### Absensi

- Status: hadir, sakit, izin, alpa, terlambat
- Absensi harian per kelas
- Catatan
- Rekap siswa, kelas, dan bulanan
- Koreksi dengan audit trail
- Export

### Keuangan

- Jenis tagihan
- Tagihan per siswa atau massal per kelas
- Jatuh tempo
- Pembayaran penuh dan sebagian
- Payment allocation
- Nomor kuitansi unik
- Pembatalan/reversal dengan alasan
- Daftar tunggakan
- Export laporan

Nominal uang tidak boleh menggunakan floating point. Gunakan integer rupiah atau tipe decimal database.

### Komunikasi

- Pengumuman sekolah, kelas, atau penerima tertentu
- Draft dan publish
- Lampiran sederhana
- Notifikasi dalam aplikasi

## 6. Use Cases Kritis

### Membuat sekolah baru

Platform Admin mengisi profil, memilih paket, menentukan trial, dan memasukkan admin pertama. Sistem membuat tenant, role default, permission default, subscription, konfigurasi awal, checklist onboarding, serta undangan admin.

### Sekolah menunggak

Tenant berubah menjadi `PAST_DUE`, menerima peringatan, lalu dapat menjadi `SUSPENDED` setelah masa toleransi. Data tetap tersimpan dan tenant dapat diaktifkan kembali.

### Import siswa

Admin mengunggah template Excel, melihat preview, memperbaiki error per baris, lalu mengonfirmasi import. Proses harus transaksional dan tidak meninggalkan data setengah jadi tanpa status jelas.

### Pembayaran sebagian

Tagihan Rp500.000 menerima pembayaran Rp300.000. Sistem menyimpan pembayaran, mengalokasikannya ke tagihan, membuat kuitansi, mengubah status menjadi `PARTIALLY_PAID`, dan menyisakan Rp200.000.

### Kesalahan pembayaran

Pembayaran salah tidak dihapus permanen. Bendahara membatalkan atau melakukan reversal dengan alasan; saldo tagihan dipulihkan dan seluruh perubahan tercatat.

### Support impersonation

Support memasukkan alasan atau nomor tiket, masuk sebagai admin sekolah dengan banner khusus, menyelesaikan masalah, lalu keluar. Waktu dan aktivitas dicatat.

## 7. Entitas Awal

### Platform

- platform_users
- schools
- subscription_plans
- school_subscriptions
- school_settings
- platform_audit_logs

### Identity dan Access

- users
- school_members
- roles
- permissions
- role_permissions
- member_roles
- invitations
- sessions

### Akademik Dasar

- academic_years
- semesters
- grade_levels
- classes
- students
- guardians
- student_guardians
- enrollments

### Absensi

- attendance_sessions
- attendance_records

### Keuangan

- fee_types
- invoices
- invoice_items
- payments
- payment_allocations
- receipts

### Komunikasi dan Sistem

- announcements
- announcement_recipients
- notifications
- audit_logs
- activity_logs
- file_uploads

## 8. Non-Fungsional

- Isolasi tenant harus diuji otomatis.
- Permission harus divalidasi server-side.
- Aktivitas sensitif harus memiliki audit trail.
- Pembayaran tidak boleh hilang tanpa jejak.
- Upload file dibatasi tipe, ukuran, dan nama file.
- Data sensitif tidak boleh ditulis ke log.
- Sistem harus usable melalui desktop dan ponsel.
- Backup dan proses pemulihan harus didokumentasikan.

## 9. Di Luar Scope V1

- E-learning
- Ujian online
- Rapor kompleks
- PPDB
- Payroll/HRIS
- Perpustakaan
- Inventaris
- Akuntansi double-entry
- Fingerprint dan face recognition
- Aplikasi mobile native
- WhatsApp API otomatis
- Payment gateway dan virtual account
- Multi-cabang kompleks
- AI assistant

## 10. Tahapan Pengerjaan

1. Bootstrap repository, standar kode, dan CI
2. Authentication, tenant model, RBAC, dan audit log
3. Platform Admin dan lifecycle tenant
4. Onboarding serta struktur sekolah
5. Siswa, wali, enrollment, import/export
6. Absensi
7. Keuangan
8. Parent Portal dan pengumuman
9. Testing, security review, backup, demo data
10. Pilot satu sekolah dan iterasi

## 11. Definition of Done V1

V1 selesai ketika:

- Platform Owner dapat membuat, memantau, suspend, reactivate, dan mengarsipkan sekolah.
- Sekolah dapat onboarding, membuat kelas, mengimpor siswa, dan mengundang staf.
- Guru dapat mengisi absensi.
- Bendahara dapat membuat tagihan, menerima pembayaran sebagian, membuat kuitansi, dan melihat tunggakan.
- Orang tua dapat melihat data anak, absensi, tagihan, pembayaran, kuitansi, dan pengumuman.
- Data antar sekolah tidak tercampur.
- Audit log, backup, export, dan monitoring tersedia.
- Satu sekolah pilot dapat menggunakan alur inti tanpa bantuan developer dalam kegiatan harian.
