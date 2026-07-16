import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

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
      <aside className="admin-sidebar">
        <Link href="/school" className="admin-brand">
          <span className="brand-mark">MS</span>
          <span>
            <strong>{school.name}</strong>
            <small>{school.code} · {school.status}</small>
          </span>
        </Link>

        <nav className="admin-nav" aria-label="Navigasi sekolah">
          <Link href="/school">Dashboard</Link>
          <Link href="/school/academic">Tahun Ajaran</Link>
          <Link href="/school/classes">Kelas & Rombel</Link>
          <Link href="/school/homerooms">Wali Kelas</Link>
          <Link href="/school/students">Siswa & Wali</Link>
          <Link href="/school/students/lifecycle">Siklus Siswa</Link>
          <Link href="/school/students/import">Import & Export</Link>
          <Link href="/school/guardians/portal">Akses Portal Wali</Link>
          <Link href="/school/attendance">Absensi</Link>
          <Link href="/school/attendance/reports">Rekap Absensi</Link>
          <Link href="/school/finance">Keuangan</Link>
          <Link href="/school/finance/reports">Laporan Keuangan</Link>
          <Link href="/school/announcements/feed">Pengumuman</Link>
          <Link href="/school/announcements">Kelola Pengumuman</Link>
          <Link href="/school/audit">Audit Log</Link>
          <Link href="/school/members">Anggota</Link>
          <Link href="/school/settings">Pengaturan</Link>
          <Link href="/account/security">Keamanan Akun</Link>
        </nav>

        <div className="admin-account">
          <strong>{session.user.name ?? "Pengguna Sekolah"}</strong>
          <small>{session.user.email}</small>
        </div>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button type="submit" className="secondary-button">Keluar</button>
        </form>
      </aside>
      <main className="admin-content">{children}</main>
    </div>
  );
}
