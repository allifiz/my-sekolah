import { auth } from "@/auth";
import { redirect } from "next/navigation";

import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/platform");

  const { error } = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="eyebrow">Platform Admin</div>
        <h1>Masuk ke My Sekolah</h1>
        <p>Gunakan akun Platform Owner yang dibuat saat proses seed.</p>

        {error ? (
          <div className="error-message">Email atau password tidak valid.</div>
        ) : null}

        <form action={loginAction} className="auth-form">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
            />
          </label>
          <button type="submit">Masuk</button>
        </form>
      </section>
    </main>
  );
}