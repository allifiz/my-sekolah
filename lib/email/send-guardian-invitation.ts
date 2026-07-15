import { Resend } from "resend";

function getBaseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function sendGuardianInvitationEmail(input: { to: string; guardianName: string; schoolName: string; token: string; expiresAt: Date }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { sent: false as const, reason: "email_not_configured" as const };
  const url = `${getBaseUrl()}/guardian/activate/${input.token}`;
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: `Aktivasi portal wali ${input.schoolName}`,
    text: `Halo ${input.guardianName},\n\nAktifkan akun portal wali ${input.schoolName}: ${url}\n\nTautan berlaku sampai ${input.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB.`,
    html: `<div style="font-family:Arial,sans-serif;padding:24px"><h1>Portal Wali</h1><p>Halo <strong>${input.guardianName}</strong>, aktifkan akses portal wali untuk ${input.schoolName}.</p><p><a href="${url}" style="background:#18181b;color:white;padding:12px 18px;border-radius:8px;text-decoration:none">Aktifkan akun</a></p></div>`,
  });
  if (error) return { sent: false as const, reason: "provider_error" as const };
  return { sent: true as const, id: data?.id ?? null };
}