export default function PrivacyPage() {
  return (
    <main className="admin-page">
      <header className="page-header"><div><span className="eyebrow">Legal</span><h1>Kebijakan Privasi</h1><p>Berlaku untuk My Sekolah V1.</p></div></header>
      <section className="panel section-panel">
        <h2>Data yang diproses</h2>
        <p>My Sekolah memproses data akun, sekolah, staf, siswa, wali, kelas, absensi, tagihan, pembayaran, pengumuman, dan catatan audit yang dimasukkan oleh sekolah.</p>
        <h2>Tujuan pemrosesan</h2>
        <p>Data digunakan untuk menyediakan layanan administrasi sekolah, autentikasi, komunikasi, pelaporan, keamanan, dukungan, dan pemenuhan kewajiban hukum.</p>
        <h2>Pengendali dan akses data</h2>
        <p>Sekolah bertindak sebagai pengendali data operasional sekolah. Pengguna hanya dapat mengakses data berdasarkan tenant, keanggotaan, role, dan relasi wali-siswa yang sah.</p>
        <h2>Penyimpanan dan keamanan</h2>
        <p>Data disimpan pada penyedia infrastruktur yang dikonfigurasi untuk layanan. Akses sensitif dicatat melalui audit log, dan kredensial disimpan dalam bentuk hash bila berlaku.</p>
        <h2>Hak subjek data</h2>
        <p>Permintaan akses, koreksi, ekspor, pembatasan, atau penghapusan data diajukan melalui sekolah terkait. Sekolah dapat meneruskan permintaan teknis kepada pengelola layanan.</p>
        <h2>Retensi</h2>
        <p>Data disimpan selama akun sekolah aktif atau selama diperlukan untuk tujuan operasional, keamanan, penyelesaian sengketa, dan kewajiban hukum. Penghapusan dapat tunduk pada masa retensi dan backup.</p>
        <h2>Perubahan kebijakan</h2>
        <p>Perubahan material akan dicatat pada versi kebijakan dan dapat diumumkan melalui aplikasi atau kanal komunikasi resmi.</p>
      </section>
    </main>
  );
}
