import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { ConfirmAction } from "@/components/confirm-action";
import { FlashMessage } from "@/components/flash-message";
import { prisma } from "@/lib/prisma";

import { assignHomeroomTeacher, endHomeroomAssignment } from "../actions";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(value);
}

export default async function HomeroomDetailPage({ params, searchParams }: { params: Promise<{ classGroupId: string }>; searchParams: Promise<{ q?: string; error?: string; success?: string }> }) {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");
  const [{ classGroupId }, queryParams] = await Promise.all([params, searchParams]);
  const query = queryParams.q?.trim() ?? "";

  const classGroup = await prisma.classGroup.findFirst({
    where: { id: classGroupId, schoolId: session.user.schoolId },
    include: {
      academicYear: true,
      gradeLevel: true,
      homeroomAssignments: { include: { schoolMember: { include: { user: true, roles: { include: { role: true } } } } }, orderBy: { startedAt: "desc" } },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!classGroup) notFound();

  const current = classGroup.homeroomAssignments.find((item) => item.isActive);
  const candidates = query.length >= 2 ? await prisma.schoolMember.findMany({
    where: {
      schoolId: session.user.schoolId,
      status: "ACTIVE",
      deletedAt: null,
      roles: { some: { role: { key: { in: ["teacher", "homeroom-teacher", "principal", "school-admin"] } } } },
      OR: [{ user: { name: { contains: query, mode: "insensitive" } } }, { user: { email: { contains: query, mode: "insensitive" } } }],
    },
    include: { user: true, roles: { include: { role: true } }, homeroomAssignments: { where: { isActive: true }, include: { classGroup: true } } },
    orderBy: { user: { name: "asc" } },
    take: 20,
  }) : [];

  return <div className="admin-page">
    <header className="page-header"><div><span className="eyebrow">Workspace wali kelas</span><h1>{classGroup.gradeLevel.name} · {classGroup.name}</h1><p>{classGroup.academicYear.name} · {classGroup._count.enrollments} siswa aktif</p></div><Link href="/school/homerooms" className="secondary-button">Kembali ke rombel</Link></header>
    {queryParams.error ? <FlashMessage tone="error" title="Penugasan gagal" message="Periksa guru atau status penugasan aktif." /> : null}
    {queryParams.success ? <FlashMessage tone="success" title="Penugasan diperbarui" message="Riwayat wali kelas sudah disimpan." /> : null}

    <section className="content-grid">
      <section className="panel section-panel"><div className="section-heading"><div><h2>Wali kelas saat ini</h2><p>Satu rombel hanya boleh memiliki satu penugasan aktif.</p></div></div>{current ? <article className="management-card"><div className="management-card-head"><div><strong>{current.schoolMember.user.name ?? current.schoolMember.user.email}</strong><p>{current.schoolMember.user.email}</p></div><span className="status-badge status-active">AKTIF</span></div><p>{current.schoolMember.roles.map(({ role }) => role.name).join(", ") || "Tanpa role"}</p><p>Mulai {formatDate(current.startedAt)}</p><ConfirmAction action={endHomeroomAssignment} triggerLabel="Akhiri penugasan" title={`Akhiri penugasan ${current.schoolMember.user.name ?? current.schoolMember.user.email}?`} description="Rombel akan berstatus belum memiliki wali kelas. Riwayat penugasan tetap disimpan." confirmLabel="Ya, akhiri"><input type="hidden" name="assignmentId" value={current.id} /></ConfirmAction></article> : <div className="empty-state compact-empty"><strong>Belum ada wali kelas</strong><p>Cari guru pada panel di sebelah untuk membuat penugasan.</p></div>}</section>

      <aside className="panel section-panel"><div className="section-heading"><div><h2>{current ? "Ganti wali kelas" : "Tetapkan wali kelas"}</h2><p>Cari nama atau email guru. Hasil dibatasi 20 anggota.</p></div></div><form method="get" className="search-toolbar"><label><span className="sr-only">Cari guru</span><input name="q" defaultValue={query} placeholder="Nama atau email guru..." autoFocus /></label><button className="secondary-button" type="submit">Cari</button></form>{query.length > 0 && query.length < 2 ? <p>Masukkan minimal dua karakter.</p> : null}{query.length >= 2 && candidates.length === 0 ? <div className="empty-state compact-empty"><strong>Guru tidak ditemukan</strong><p>Pastikan anggota aktif memiliki role pengajar.</p></div> : null}{candidates.map((candidate) => <article className="management-card" key={candidate.id}><strong>{candidate.user.name ?? candidate.user.email}</strong><p>{candidate.user.email}</p><p>{candidate.roles.map(({ role }) => role.name).join(", ")}</p>{candidate.homeroomAssignments.length > 0 ? <p><small>Saat ini menangani {candidate.homeroomAssignments.map((item) => item.classGroup.name).join(", ")}.</small></p> : null}<ConfirmAction action={assignHomeroomTeacher} triggerLabel={current ? "Pilih sebagai pengganti" : "Tetapkan guru"} triggerClassName="primary-button" confirmClassName="primary-button" title={`${current ? "Ganti" : "Tetapkan"} wali kelas ke ${candidate.user.name ?? candidate.user.email}?`} description={current ? "Penugasan lama akan diakhiri dan guru ini menjadi wali kelas aktif." : "Guru ini akan menjadi wali kelas aktif untuk rombel ini."} confirmLabel="Ya, simpan penugasan"><input type="hidden" name="classGroupId" value={classGroup.id} /><input type="hidden" name="schoolMemberId" value={candidate.id} /></ConfirmAction></article>)}</aside>
    </section>

    <section className="panel section-panel"><div className="section-heading"><div><h2>Riwayat penugasan</h2><p>Semua pergantian wali kelas untuk rombel ini.</p></div></div>{classGroup.homeroomAssignments.length === 0 ? <div className="empty-state compact-empty"><strong>Belum ada riwayat</strong><p>Penugasan pertama akan tampil setelah disimpan.</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Guru</th><th>Mulai</th><th>Selesai</th><th>Status</th></tr></thead><tbody>{classGroup.homeroomAssignments.map((assignment) => <tr key={assignment.id}><td><strong>{assignment.schoolMember.user.name ?? assignment.schoolMember.user.email}</strong><small>{assignment.schoolMember.user.email}</small></td><td>{formatDate(assignment.startedAt)}</td><td>{assignment.endedAt ? formatDate(assignment.endedAt) : "—"}</td><td><span className={`status-badge ${assignment.isActive ? "status-active" : "status-archived"}`}>{assignment.isActive ? "AKTIF" : "SELESAI"}</span></td></tr>)}</tbody></table></div>}</section>
  </div>;
}
