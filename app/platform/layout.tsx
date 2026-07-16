import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { ResponsiveSidebar } from "@/components/responsive-sidebar";

export default async function PlatformLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.platformRole) redirect("/");

  return (
    <div className="admin-layout">
      <ResponsiveSidebar>
        <Link href="/platform" className="admin-brand">
          <span className="brand-mark">MS</span>
          <span><strong>My Sekolah</strong><small>Platform Admin</small></span>
        </Link>
        <nav className="admin-nav" aria-label="Navigasi platform">
          <Link href="/platform">Ringkasan</Link>
          <Link href="/platform/schools">Sekolah</Link>
          <Link href="/account/security">Keamanan Akun</Link>
        </nav>
        <div className="admin-account">
          <strong>{session.user.name ?? "Platform Admin"}</strong>
          <small>{session.user.email}</small>
          <small>{session.user.platformRole}</small>
        </div>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button type="submit" className="secondary-button">Keluar</button>
        </form>
      </ResponsiveSidebar>
      <main className="admin-main">{children}</main>
    </div>
  );
}
