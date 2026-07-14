import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");

  const school = await prisma.school.findUnique({
    where: { id: session.user.schoolId },
    select: { name: true, code: true, status: true },
  });
  if (!school) redirect("/login");

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div><span className="eyebrow">School Workspace</span><h2>{school.name}</h2><p>{school.code} · {school.status}</p></div>
        <nav className="admin-nav">
          <Link href="/school">Dashboard</Link>
          <Link href="/school/academic">Akademik</Link>
          <Link href="/school/members">Anggota</Link>
          <Link href="/school/settings">Pengaturan</Link>
        </nav>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button type="submit" className="secondary-button">Keluar</button>
        </form>
      </aside>
      <main className="admin-content">{children}</main>
    </div>
  );
}