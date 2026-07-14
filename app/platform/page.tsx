import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function PlatformDashboardPage() {
  const [session, schoolCount, activeSchoolCount, userCount] = await Promise.all([
    auth(),
    prisma.school.count({ where: { deletedAt: null } }),
    prisma.school.count({ where: { status: "ACTIVE", deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null } }),
  ]);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <div className="eyebrow">Platform Admin</div>
          <h1>Dashboard My Sekolah</h1>
          <p>Selamat datang, {session?.user.name ?? session?.user.email}.</p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="secondary-button">Keluar</button>
        </form>
      </header>

      <section className="stats-grid">
        <article><span>Total sekolah</span><strong>{schoolCount}</strong></article>
        <article><span>Sekolah aktif</span><strong>{activeSchoolCount}</strong></article>
        <article><span>Total pengguna</span><strong>{userCount}</strong></article>
        <article><span>Role platform</span><strong>{session?.user.platformRole}</strong></article>
      </section>
    </main>
  );
}