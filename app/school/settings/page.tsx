import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { updateSchoolSettings } from "./actions";

export default async function SchoolSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const params = await searchParams;
  const [school, member] = await Promise.all([
    prisma.school.findUnique({ where: { id: session.user.schoolId }, include: { settings: true } }),
    prisma.schoolMember.findFirst({ where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null }, include: { roles: { include: { role: true } } } }),
  ]);
  if (!school || !member) redirect("/login");
  const canManage = member.roles.some(({ role }) => ["school-owner", "school-admin"].includes(role.key));

  return (
    <div className="admin-page">
      <header className="page-header"><div><span className="eyebrow">Konfigurasi tenant</span><h1>Pengaturan Sekolah</h1><p>Kelola profil, zona waktu, locale, dan format nomor kuitansi.</p></div></header>
      {params.error ? <section className="panel section-panel"><strong>Gagal:</strong> Periksa kembali data pengaturan.</section> : null}
      {params.success ? <section className="panel section-panel"><strong>Berhasil:</strong> Pengaturan sekolah sudah diperbarui.</section> : null}

      <section className="stats-grid">
        <article><span>Status</span><strong>{school.status}</strong></article>
        <article><span>Trial berakhir</span><strong>{school.trialEndsAt ? school.trialEndsAt.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" }) : "-"}</strong></article>
        <article><span>Subscription berakhir</span><strong>{school.subscriptionEndsAt ? school.subscriptionEndsAt.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" }) : "-"}</strong></article>
        <article><span>Batas siswa / pengguna</span><strong>{school.studentLimit} / {school.userLimit}</strong></article>
      </section>

      <section className="panel section-panel">
        <h2>Profil dan Operasional</h2>
        {!canManage ? <p>Hanya School Owner dan School Admin yang dapat mengubah pengaturan.</p> : (
          <form action={updateSchoolSettings} className="admin-form">
            <label>Nama sekolah<input name="name" defaultValue={school.name} required /></label>
            <label>Email sekolah<input name="email" type="email" defaultValue={school.email ?? ""} /></label>
            <label>Telepon<input name="phone" defaultValue={school.phone ?? ""} /></label>
            <label>Alamat<textarea name="address" rows={3} defaultValue={school.address ?? ""} /></label>
            <label>Zona waktu<select name="timezone" defaultValue={school.timezone}><option value="Asia/Jakarta">WIB · Asia/Jakarta</option><option value="Asia/Makassar">WITA · Asia/Makassar</option><option value="Asia/Jayapura">WIT · Asia/Jayapura</option></select></label>
            <label>Prefix kuitansi<input name="receiptPrefix" defaultValue={school.settings?.receiptPrefix ?? "RCT"} required /></label>
            <label>Locale<select name="defaultLocale" defaultValue={school.settings?.defaultLocale ?? "id-ID"}><option value="id-ID">Bahasa Indonesia</option><option value="en-US">English</option></select></label>
            <button className="primary-button" type="submit">Simpan Pengaturan</button>
          </form>
        )}
      </section>
    </div>
  );
}
