import { createHash } from "node:crypto";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { acceptInvitation } from "../actions";

export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: { school: { select: { name: true, status: true } } },
  });

  if (!invitation) notFound();
  const unavailable = invitation.status !== "PENDING" || invitation.expiresAt <= new Date();

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="eyebrow">Aktivasi akun sekolah</span>
        <h1>{invitation.school.name}</h1>
        <p>Undangan untuk <strong>{invitation.email}</strong>. Buat password untuk mengaktifkan akses School Owner.</p>
        {unavailable ? (
          <div className="form-alert">Undangan sudah dipakai atau kedaluwarsa.</div>
        ) : (
          <form action={acceptInvitation} className="stack-form">
            <input type="hidden" name="token" value={token} />
            {error && <div className="form-alert">Periksa nama dan password. Password minimal 12 karakter.</div>}
            <label className="field"><span>Nama lengkap</span><input name="name" required minLength={3} /></label>
            <label className="field"><span>Password</span><input name="password" type="password" required minLength={12} autoComplete="new-password" /></label>
            <button type="submit" className="primary-button">Aktifkan akun</button>
          </form>
        )}
      </section>
    </main>
  );
}
