import Link from "next/link";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { markAnnouncementRead } from "../actions";

type FeedRow = {
  id: string;
  title: string;
  content: string;
  audience: "SCHOOL" | "CLASS_GROUP";
  publishAt: Date | null;
  expiresAt: Date | null;
  classGroupName: string | null;
  gradeLevelName: string | null;
  creatorName: string | null;
  creatorEmail: string;
  readAt: Date | null;
};

export default async function AnnouncementFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");

  const member = await prisma.schoolMember.findFirst({
    where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null },
    include: {
      roles: { include: { role: true } },
      homeroomAssignments: { where: { isActive: true }, select: { classGroupId: true } },
    },
  });
  if (!member) redirect("/school?error=forbidden");

  const params = await searchParams;
  const canManage = member.roles.some(({ role }) => ["school-owner", "school-admin", "principal"].includes(role.key));
  const assignedIds = member.homeroomAssignments.map((item) => item.classGroupId);
  const announcements = await prisma.$queryRaw<FeedRow[]>(Prisma.sql`
    SELECT
      a."id", a."title", a."content", a."audience", a."publishAt", a."expiresAt",
      cg."name" AS "classGroupName", gl."name" AS "gradeLevelName",
      u."name" AS "creatorName", u."email" AS "creatorEmail", ar."readAt"
    FROM "Announcement" a
    JOIN "SchoolMember" creator ON creator."id" = a."createdById"
    JOIN "User" u ON u."id" = creator."userId"
    LEFT JOIN "ClassGroup" cg ON cg."id" = a."classGroupId"
    LEFT JOIN "GradeLevel" gl ON gl."id" = cg."gradeLevelId"
    LEFT JOIN "AnnouncementRead" ar ON ar."announcementId" = a."id" AND ar."schoolMemberId" = ${member.id}
    WHERE a."schoolId" = ${session.user.schoolId}
      AND a."status" = 'PUBLISHED'
      AND COALESCE(a."publishAt", NOW()) <= NOW()
      AND (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
      AND (
        a."audience" = 'SCHOOL'
        OR ${canManage}
        OR a."classGroupId" IN (${Prisma.join(assignedIds.length ? assignedIds : ["__none__"])})
      )
    ORDER BY COALESCE(a."publishAt", a."createdAt") DESC
    LIMIT 100
  `);

  const unreadCount = announcements.filter((item) => !item.readAt).length;

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Informasi terbaru</span>
          <h1>Feed Pengumuman</h1>
          <p>{unreadCount} pengumuman belum dibaca. Pengumuman rombel hanya muncul untuk pihak yang memiliki akses.</p>
        </div>
        {canManage ? <Link href="/school/announcements" className="secondary-button">Kelola Pengumuman</Link> : null}
      </header>

      {params.error ? <section className="panel section-panel"><strong>Gagal:</strong> Pengumuman tidak ditemukan atau tidak dapat diakses.</section> : null}
      {params.success ? <section className="panel section-panel"><strong>Berhasil:</strong> Pengumuman ditandai sudah dibaca.</section> : null}

      <section className="stats-grid">
        <article><span>Aktif</span><strong>{announcements.length}</strong></article>
        <article><span>Belum dibaca</span><strong>{unreadCount}</strong></article>
        <article><span>Sudah dibaca</span><strong>{announcements.length - unreadCount}</strong></article>
      </section>

      <section className="panel section-panel">
        <h2>Pengumuman Aktif</h2>
        {announcements.length === 0 ? <p>Belum ada pengumuman aktif.</p> : (
          <div className="stats-grid">
            {announcements.map((item) => (
              <article key={item.id}>
                <span>{item.readAt ? "Sudah dibaca" : "Baru"} · {item.audience === "SCHOOL" ? "Seluruh sekolah" : `${item.gradeLevelName ?? ""} ${item.classGroupName ?? ""}`}</span>
                <strong>{item.title}</strong>
                <p style={{ whiteSpace: "pre-wrap" }}>{item.content}</p>
                <p>Oleh {item.creatorName ?? item.creatorEmail}</p>
                <p>Tayang {item.publishAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "sekarang"}</p>
                {item.expiresAt ? <p>Berakhir {item.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p> : null}
                {!item.readAt ? (
                  <form action={markAnnouncementRead}>
                    <input type="hidden" name="announcementId" value={item.id} />
                    <button className="primary-button" type="submit">Tandai Sudah Dibaca</button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
