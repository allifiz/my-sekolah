import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { changePassword } from "./actions";

const errors: Record<string, string> = {
  "invalid-password": "Password baru minimal 10 karakter dan konfirmasi harus sama.",
  "password-unchanged": "Password baru harus berbeda dari password lama.",
  "password-unavailable": "Akun ini belum menggunakan login password.",
  "current-password": "Password lama tidak benar.",
};

export default async function AccountSecurityPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const params = await searchParams;

  return (
    <main className="admin-page">
      <header className="page-header"><div><span className="eyebrow">Keamanan akun</span><h1>Ganti Password</h1><p>Verifikasi password lama sebelum menetapkan password baru.</p></div></header>
      {params.error ? <section className="panel section-panel"><strong>Gagal:</strong> {errors[params.error] ?? "Perubahan password gagal."}</section> : null}
      {params.success ? <section className="panel section-panel"><strong>Berhasil:</strong> Password akun sudah diperbarui.</section> : null}
      <section className="panel section-panel">
        <form action={changePassword} className="admin-form">
          <label>Password lama<input type="password" name="currentPassword" minLength={8} autoComplete="current-password" required /></label>
          <label>Password baru<input type="password" name="newPassword" minLength={10} autoComplete="new-password" required /></label>
          <label>Ulangi password baru<input type="password" name="confirmPassword" minLength={10} autoComplete="new-password" required /></label>
          <button className="primary-button" type="submit">Simpan Password Baru</button>
        </form>
      </section>
      <p><Link href={session.user.schoolId ? "/school" : "/guardian"}>Kembali ke dashboard</Link></p>
    </main>
  );
}
