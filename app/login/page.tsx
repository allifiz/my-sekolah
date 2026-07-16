import { auth } from "@/auth";
import { redirect } from "next/navigation";

import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/after-login");

  const { error } = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-showcase">
        <div>
          <span className="eyebrow" style={{ color: "white" }}>My Sekolah</span>
          <h1>Satu ruang kerja untuk operasional sekolah yang lebih tertata.</h1>
          <p>Kelola akademik, siswa, absensi, keuangan, pengumuman, dan komunikasi wali dalam satu sistem yang ringan dan mudah digunakan.</p>
        </div>
        <div className="auth-benefits">
          <span>Data sekolah terpusat</span>
          <span>Akses sesuai peran</span>
          <span>Ringkasan real-time</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="eyebrow">Selamat datang</div>
          <h2>Masuk ke akun Anda</h2>
          <p>Gunakan email dan password yang sudah terdaftar.</p>

          {error ? <div className="error-message">Email atau password tidak valid.</div> : null}

          <form action={loginAction} className="auth-form">
            <label>
              Email
              <input name="email" type="email" autoComplete="email" placeholder="nama@sekolah.id" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" placeholder="Minimal 8 karakter" minLength={8} required />
            </label>
            <button type="submit">Masuk ke My Sekolah</button>
          </form>
        </div>
      </section>
    </main>
  );
}
