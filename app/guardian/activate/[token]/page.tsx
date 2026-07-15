import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { activateGuardian } from "./actions";

export default async function GuardianActivationPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const rows = await prisma.$queryRaw<Array<{ email: string; expiresAt: Date; acceptedAt: Date | null; guardianName: string; schoolName: string }>>`SELECT gi."email",gi."expiresAt",gi."acceptedAt",g."name" AS "guardianName",s."name" AS "schoolName" FROM "GuardianInvitation" gi JOIN "Guardian" g ON g."id"=gi."guardianId" JOIN "School" s ON s."id"=gi."schoolId" WHERE gi."tokenHash"=${tokenHash} LIMIT 1`;
  const invitation = rows[0];
  if (!invitation) notFound();
  const unavailable = invitation.acceptedAt || invitation.expiresAt <= new Date();
  return <main className="auth-shell"><section className="auth-card"><span className="eyebrow">Aktivasi portal wali</span><h1>{invitation.schoolName}</h1><p>Akun untuk <strong>{invitation.guardianName}</strong> · {invitation.email}</p>{error ? <div className="form-alert">Aktivasi gagal. Periksa password atau status email.</div> : null}{unavailable ? <div className="form-alert">Undangan sudah digunakan atau kedaluwarsa.</div> : <form action={activateGuardian} className="stack-form"><input type="hidden" name="token" value={token}/><label className="field"><span>Nama lengkap</span><input name="name" defaultValue={invitation.guardianName} minLength={3} required/></label><label className="field"><span>Password</span><input type="password" name="password" minLength={12} required/></label><button className="primary-button" type="submit">Aktifkan Portal Wali</button></form>}</section></main>;
}