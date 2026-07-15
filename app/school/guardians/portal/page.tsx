import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { inviteGuardian } from "./actions";

export default async function GuardianPortalManagementPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const member = await prisma.schoolMember.findFirst({ where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal"] } } } } }, select: { id: true } });
  if (!member) redirect("/school?error=forbidden");
  const params = await searchParams;
  const guardians = await prisma.guardian.findMany({ where: { schoolId: session.user.schoolId, deletedAt: null }, include: { students: { include: { student: true } } }, orderBy: { name: "asc" } });
  const active = await prisma.$queryRaw<Array<{ guardianId: string; email: string }>>`SELECT ga."guardianId", u."email" FROM "GuardianAccount" ga JOIN "User" u ON u."id" = ga."userId" WHERE ga."schoolId" = ${session.user.schoolId}`;
  const activeMap = new Map(active.map((item) => [item.guardianId, item.email]));
  return <div className="admin-page"><header className="page-header"><div><span className="eyebrow">Akses wali</span><h1>Portal Wali</h1><p>Kirim undangan aktivasi dan pantau akun wali yang sudah aktif.</p></div></header>
    {params.success ? <section className="panel section-panel"><strong>Berhasil:</strong> Undangan portal wali sudah dibuat.</section> : null}
    {params.error ? <section className="panel section-panel"><strong>Gagal:</strong> Periksa data wali atau status akun.</section> : null}
    <section className="panel section-panel"><h2>Kirim Undangan</h2><form action={inviteGuardian} className="admin-form"><label>Wali<select name="guardianId" required defaultValue=""><option value="" disabled>Pilih wali</option>{guardians.filter((g) => !activeMap.has(g.id)).map((g) => <option key={g.id} value={g.id}>{g.name} · {g.students.map((s) => s.student.name).join(", ") || "belum terhubung siswa"}</option>)}</select></label><label>Email<input type="email" name="email" required /></label><button className="primary-button" type="submit">Kirim Aktivasi</button></form></section>
    <section className="panel section-panel"><h2>Status Akun</h2><div className="stats-grid">{guardians.map((g) => <article key={g.id}><span>{activeMap.has(g.id) ? "AKTIF" : "BELUM AKTIF"}</span><strong>{g.name}</strong><p>{activeMap.get(g.id) ?? g.email ?? "Email belum tersedia"}</p><p>{g.students.map((s) => s.student.name).join(", ") || "Belum terhubung siswa"}</p></article>)}</div></section></div>;
}