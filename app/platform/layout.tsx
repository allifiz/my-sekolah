import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

export default async function PlatformLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.platformRole) redirect("/");

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Link href="/platform" className="admin-brand">
          <span className="brand-mark">MS</span>
          <span><strong>My Sekolah</strong><small>Platform Admin</small></span>
        </Link>
        <nav className="admin-nav" aria-label="Navigasi platform">
          <Link href="/platform">Ringkasan</Link>
          <Link href="/platform/schools">Sekolah</Link>
        </nav>
        <div className="admin-account">
          <span>{session.user.name ?? session.user.email}</span>
          <small>{session.user.platformRole}</small>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button type="submit" className="text-button">Keluar</button>
          </form>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
