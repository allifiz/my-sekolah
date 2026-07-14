const areas = [
  {
    title: "Platform Admin",
    description: "Kelola tenant sekolah, status langganan, limit, dan dukungan dari satu pusat kontrol.",
  },
  {
    title: "School Application",
    description: "Kelola siswa, kelas, absensi, tagihan, pembayaran, dan pengguna sekolah.",
  },
  {
    title: "Parent Portal",
    description: "Orang tua dapat melihat absensi, tagihan, pembayaran, kuitansi, dan pengumuman anak.",
  },
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">My Sekolah · V1</span>
        <h1>SaaS manajemen sekolah multi-tenant.</h1>
        <p>
          Satu platform untuk mengelola banyak sekolah dengan data yang terisolasi,
          akses berbasis role, dan audit trail untuk aktivitas sensitif.
        </p>
      </section>

      <section className="grid" aria-label="Area aplikasi V1">
        {areas.map((area) => (
          <article className="card" key={area.title}>
            <h2>{area.title}</h2>
            <p>{area.description}</p>
          </article>
        ))}
      </section>

      <footer>
        Fondasi aplikasi sedang dikembangkan. Deployment Vercel sudah aktif.
      </footer>
    </main>
  );
}
