import Link from "next/link";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ConfirmAction } from "@/components/confirm-action";
import { prisma } from "@/lib/prisma";

import { createAnnouncement, publishAnnouncement, unpublishAnnouncement } from "./actions";
import { deleteDraftAnnouncement } from "./delete-actions";

type AnnouncementRow = {
  id: string;
  title: string;
  content: string;
  status: "DRAFT" | "PUBLISHED" | "UNPUBLISHED";
  audience: "SCHOOL" | "CLASS_GROUP";
  publishAt: Date | null;
  expiresAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  classGroupId: string | null;
  classGroupName: string | null;
  gradeLevelName: string | null;
  creatorName: string | null;
  creatorEmail: string;
  readCount: bigint;
};

const errors: Record<string, string> = {
  forbidden: "Kamu tidak memiliki hak untuk mengelola pengumuman.",
  "invalid-announcement": "Judul atau isi pengumuman belum valid.",
  "class-required": "Rombel wajib dipilih untuk target rombel.",
  "class-not-found": "Rombel tidak ditemukan.",
  "invalid-schedule": "Masa berlaku harus setelah jadwal publikasi.",
  "invalid-request": "Permintaan tidak valid.",
  "reason-required": "Alasan minimal lima karakter wajib diisi.",
  "not-found": "Pengumuman tidak ditemukan.",
  "delete-draft-only": "Hanya pengumuman berstatus draft yang boleh dihapus permanen.",
};

function localDateTime(date?: Date | null) {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");

  const member = await prisma.schoolMember.findFirst({
    where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal"] } } } } },
    select: { id: true },
  });
  if (!member) redirect("/school?error=forbidden");

  const schoolId = session.user.schoolId;
  const [params, classGroups, announcements] = await Promise.all([
    searchParams,
    prisma.classGroup.findMany({ where: { schoolId, isActive: true }, include: { academicYear: true, gradeLevel: true }, orderBy: [{ academicYear: { startDate: "desc" } }, { gradeLevel: { order: "asc" } }, { name: "asc" }] }),
    prisma.$queryRaw<AnnouncementRow[]>(Prisma.sql`
      SELECT a."id", a."title", a."content", a."status", a."audience", a."publishAt", a."expiresAt",
        a."publishedAt", a."createdAt", a."classGroupId", cg."name" AS "classGroupName",
        gl."name" AS "gradeLevelName", u."name" AS "creatorName", u."email" AS "creatorEmail",
        COUNT(ar."id") AS "readCount"
      FROM "Announcement" a
      JOIN "SchoolMember" sm ON sm."id" = a."createdById"
      JOIN "User" u ON u."id" = sm."userId"
      LEFT JOIN "ClassGroup" cg ON cg."id" = a."classGroupId"
      LEFT JOIN "GradeLevel" gl ON gl."id" = cg."gradeLevelId"
      LEFT JOIN "AnnouncementRead" ar ON ar."announcementId" = a."id"
      WHERE a."schoolId" = ${schoolId}
      GROUP BY a."id", cg."name", gl."name", u."name", u."email"
      ORDER BY a."createdAt" DESC
      LIMIT 100
    `),
  ]);

  const now = new Date();
  const defaultExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return (
    <div className="admin-page">
      <header className="page-header"><div><span className="eyebrow">Komunikasi sekolah</span><h1>Kelola Pengumuman</h1><p>Form tetap berada di halaman karena isi, target, dan jadwal perlu ditinjau bersama sebelum publikasi.</p></div><Link href="/school/announcements/feed" className="secondary-button">Buka Feed</Link></header>
      {params.error ? <section className="panel section-panel"><strong>Gagal:</strong> {errors[params.error] ?? "Terjadi kesalahan."}</section> : null}
      {params.success ? <section className="panel section-panel"><strong>Berhasil:</strong> Pengumuman sudah diperbarui.</section> : null}

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Buat Pengumuman</h2><p>Simpan sebagai draft untuk review, atau publikasikan setelah target dan jadwal dipastikan.</p></div></div>
        <form action={createAnnouncement} className="admin-form">
          <label>Judul<input name="title" required minLength={3} maxLength={180} placeholder="Informasi kegiatan sekolah" /></label>
          <label>Isi<textarea name="content" required minLength={10} maxLength={10000} rows={7} /></label>
          <div className="form-grid">
            <label>Target<select name="audience" defaultValue="SCHOOL"><option value="SCHOOL">Seluruh sekolah</option><option value="CLASS_GROUP">Rombel tertentu</option></select></label>
            <label>Rombel<select name="classGroupId" defaultValue=""><option value="">Tidak dipilih</option>{classGroups.map((group) => <option key={group.id} value={group.id}>{group.academicYear.name} · {group.gradeLevel.name} · {group.name}</option>)}</select></label>
            <label>Jadwal publikasi<input name="publishAt" type="datetime-local" defaultValue={localDateTime(now)} /></label>
            <label>Berlaku sampai<input name="expiresAt" type="datetime-local" defaultValue={localDateTime(defaultExpiry)} /></label>
          </div>
          <p className="inline-note">Jika targetnya rombel, rombel wajib dipilih. Setelah dipublikasikan, pengumuman tidak dapat dihapus permanen—hanya dapat ditarik tayang.</p>
          <div className="button-row"><button name="submitMode" value="DRAFT" className="secondary-button" type="submit">Simpan Draft</button><button name="submitMode" value="PUBLISH" className="primary-button" type="submit">Publikasikan Sekarang</button></div>
        </form>
      </section>

      <section className="panel section-panel">
        <div className="section-heading"><div><h2>Daftar Pengumuman</h2><p>Setiap perubahan status meminta konfirmasi dan menjelaskan dampaknya.</p></div></div>
        {announcements.length === 0 ? <div className="empty-state"><strong>Belum ada pengumuman</strong></div> : (
          <div className="context-list">
            {announcements.map((item) => (
              <article key={item.id} className="context-card">
                <div className="context-card-head">
                  <div>
                    <span className={`status-badge ${item.status === "PUBLISHED" ? "status-active" : ""}`}>{item.status} · {item.audience === "SCHOOL" ? "Seluruh sekolah" : `${item.gradeLevelName ?? ""} ${item.classGroupName ?? ""}`}</span>
                    <h3>{item.title}</h3>
                    <p>{item.content.length > 220 ? `${item.content.slice(0, 220)}…` : item.content}</p>
                    <small>Dibuat oleh {item.creatorName ?? item.creatorEmail} · dibaca {Number(item.readCount)} anggota</small>
                    <p>Tayang {item.publishAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "belum dijadwalkan"}{item.expiresAt ? ` · berakhir ${item.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}` : ""}</p>
                  </div>
                  <div className="button-row">
                    {item.status !== "PUBLISHED" ? <ConfirmAction action={publishAnnouncement} title={`Publikasikan “${item.title}”?`} description={`Pengumuman akan terlihat oleh ${item.audience === "SCHOOL" ? "seluruh sekolah" : "rombel yang dipilih"}.`} triggerLabel="Publikasikan" confirmLabel="Ya, publikasikan" confirmClassName="primary-button"><input type="hidden" name="announcementId" value={item.id} /></ConfirmAction> : null}
                    {item.status === "DRAFT" ? <ConfirmAction action={deleteDraftAnnouncement} title={`Hapus draft “${item.title}”?`} description="Draft akan dihapus permanen dan tidak dapat dipulihkan." triggerLabel="Hapus Draft"><input type="hidden" name="announcementId" value={item.id} /></ConfirmAction> : null}
                    {item.status === "PUBLISHED" ? <ConfirmAction action={unpublishAnnouncement} title={`Tarik tayang “${item.title}”?`} description="Pengumuman tidak lagi tampil di feed. Alasan akan disimpan pada audit log." triggerLabel="Tarik Tayang" confirmLabel="Ya, tarik tayang"><input type="hidden" name="announcementId" value={item.id} /><label className="field-wide">Alasan<input name="reason" required minLength={5} placeholder="Contoh: jadwal kegiatan berubah" /></label></ConfirmAction> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
