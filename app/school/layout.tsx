import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { ResponsiveSidebar } from "@/components/responsive-sidebar";
import { SidebarNav } from "@/components/sidebar-nav";
import { prisma } from "@/lib/prisma";

const navigation = [
  { label: "Ringkasan", items: [{ href: "/school", label: "Dashboard", icon: "⌂", exact: true }] },
  { label: "Akademik", items: [
    { href: "/school/academic", label: "Tahun Ajaran", icon: "◫" },
    { href: "/school/classes", label: "Kelas & Rombel", icon: "▦" },
    { href: "/school/homerooms", label: "Wali Kelas", icon: "◎" },
  ] },
  { label: "Peserta Didik", items: [
    { href: "/school/students", label: "Siswa & Wali", icon: "♙", exact: true },
    { href: "/school/students/lifecycle", label: "Siklus Siswa", icon: "↻" },
    { href: "/school/students/import", label: "Import & Export", icon: "⇅" },
    { href: "/school/guardians/portal", label: "Portal Wali", icon: "◇" },
  ] },
  { label: "Operasional", items: [
    { href: "/school/attendance", label: "Absensi", icon: "✓", exact: true },
    { href: "/school/attendance/reports", label: "Rekap Absensi", icon: "▥" },
    { href: "/school/finance", label: "Keuangan", icon: "Rp", exact: true },
    { href: "/school/finance/reports", label: "Laporan Keuangan", icon: "↗" },
    { href: "/school/announcements/feed", label: "Pengumuman", icon: "◉" },
    { href: "/school/announcements", label: "Kelola Pengumuman", icon: "✎", exact: true },
  ] },
  { label: "Administrasi", items: [
    { href: "/school/audit", label: "Audit Log", icon: "≣" },
    { href: "/school/members", label: "Anggota", icon: "♧" },
    { href: "/school/settings", label: "Pengaturan", icon: "⚙" },
    { href: "/account/security", label: "Keamanan Akun", icon: "◆" },
  ] },
];

export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId || session.user.guardianId) redirect("/login");

  const school = await prisma.school.findUnique({
    where: { id: session.user.schoolId },
    select: { name: true, code: true, status: true },
  });
  if (!school) redirect("/login");

  return (
    <div className="admin-layout">
      <ResponsiveSidebar>
        <Link href="/school" className="admin-brand">
          <span className="brand-mark">MS</span>
          <span><strong>{school.name}</strong><small>{school.code} · {school.status}</small></span>
        </Link>
        <SidebarNav groups={navigation} />
        <div className="admin-account"><strong>{session.user.name ?? "Pengguna Sekolah"}</strong><small>{session.user.email}</small></div>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button type="submit" className="secondary-button">Keluar</button>
        </form>
      </ResponsiveSidebar>
      <main className="admin-content">{children}</main>
    </div>
  );
}
