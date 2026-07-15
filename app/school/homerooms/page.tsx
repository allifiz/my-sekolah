import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { assignHomeroomTeacher, endHomeroomAssignment } from "./actions";

const errorMessages: Record<string, string> = {
  "invalid-assignment": "Data penugasan wali kelas belum valid.",
  "reference-not-found": "Rombel atau anggota sekolah tidak ditemukan.",
  "already-assigned": "Anggota tersebut sudah menjadi wali kelas rombel ini.",
  "assignment-not-found": "Penugasan aktif tidak ditemukan.",
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

export default async function HomeroomsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");

  const [classGroups, members, assignments, params] = await Promise.all([
    prisma.classGroup.findMany({
      where: { schoolId: session.user.schoolId, isActive: true },
      include: { academicYear: true, gradeLevel: true },
      orderBy: [
        { academicYear: { startDate: "desc" } },
        { gradeLevel: { order: "asc" } },
        { name: "asc" },
      ],
    }),
    prisma.schoolMember.findMany({
      where: {
        schoolId: session.user.schoolId,
        status: "ACTIVE",
        deletedAt: null,
      },
      include: {
        user: true,
        roles: { include: { role: true } },
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.homeroomAssignment.findMany({
      where: { schoolId: session.user.schoolId },
      include: {
        classGroup: { include: { academicYear: true, gradeLevel: true } },
        schoolMember: { include: { user: true } },
      },
      orderBy: [{ isActive: "desc" }, { startedAt: "desc" }],
    }),
    searchParams,
  ]);

  const activeAssignments = assignments.filter((item) => item.isActive);
  const activeByClass = new Map(activeAssignments.map((item) => [item.classGroupId, item]));

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Struktur akademik</span>
          <h1>Wali Kelas</h1>
          <p>Tetapkan anggota sekolah sebagai wali kelas dan simpan riwayat pergantiannya.</p>
        </div>
      </header>

      {params.error ? (
        <section className="panel section-panel">
          <strong>Gagal:</strong> {errorMessages[params.error] ?? "Terjadi kesalahan."}
        </section>
      ) : null}
      {params.success ? (
        <section className="panel section-panel">
          <strong>Berhasil:</strong> Penugasan wali kelas sudah diperbarui.
        </section>
      ) : null}

      <section className="stats-grid">
        <article><span>Rombel aktif</span><strong>{classGroups.length}</strong></article>
        <article><span>Sudah memiliki wali</span><strong>{activeAssignments.length}</strong></article>
        <article><span>Belum memiliki wali</span><strong>{Math.max(0, classGroups.length - activeAssignments.length)}</strong></article>
        <article><span>Anggota tersedia</span><strong>{members.length}</strong></article>
      </section>

      <section className="panel section-panel">
        <h2>Tetapkan Wali Kelas</h2>
        {classGroups.length === 0 || members.length === 0 ? (
          <p>Buat rombel aktif dan anggota sekolah terlebih dahulu.</p>
        ) : (
          <form action={assignHomeroomTeacher} className="admin-form">
            <label>
              Rombongan belajar
              <select name="classGroupId" required defaultValue="">
                <option value="" disabled>Pilih rombel</option>
                {classGroups.map((group) => {
                  const current = activeByClass.get(group.id);
                  return (
                    <option key={group.id} value={group.id}>
                      {group.academicYear.name} · {group.gradeLevel.name} · {group.name}
                      {current ? ` · ${current.schoolMember.user.name ?? current.schoolMember.user.email}` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              Anggota sekolah
              <select name="schoolMemberId" required defaultValue="">
                <option value="" disabled>Pilih anggota</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.user.name ?? member.user.email} · {member.roles.map(({ role }) => role.name).join(", ") || "Tanpa role"}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="primary-button">Simpan Penugasan</button>
          </form>
        )}
      </section>

      <section className="panel section-panel">
        <h2>Penugasan Aktif</h2>
        {activeAssignments.length === 0 ? (
          <p>Belum ada wali kelas aktif.</p>
        ) : (
          <div className="stats-grid">
            {activeAssignments.map((assignment) => (
              <article key={assignment.id}>
                <span>{assignment.classGroup.academicYear.name} · {assignment.classGroup.gradeLevel.name}</span>
                <strong>{assignment.classGroup.name}</strong>
                <p>{assignment.schoolMember.user.name ?? assignment.schoolMember.user.email}</p>
                <p>Mulai {formatDate(assignment.startedAt)}</p>
                <form action={endHomeroomAssignment}>
                  <input type="hidden" name="assignmentId" value={assignment.id} />
                  <button type="submit" className="secondary-button">Akhiri Penugasan</button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel section-panel">
        <h2>Riwayat Wali Kelas</h2>
        {assignments.filter((item) => !item.isActive).length === 0 ? (
          <p>Belum ada riwayat pergantian wali kelas.</p>
        ) : (
          <div className="stats-grid">
            {assignments.filter((item) => !item.isActive).map((assignment) => (
              <article key={assignment.id}>
                <span>{assignment.classGroup.academicYear.name} · {assignment.classGroup.name}</span>
                <strong>{assignment.schoolMember.user.name ?? assignment.schoolMember.user.email}</strong>
                <p>{formatDate(assignment.startedAt)} – {assignment.endedAt ? formatDate(assignment.endedAt) : "Selesai"}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
