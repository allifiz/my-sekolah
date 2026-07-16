import { Resend } from "resend";

interface SendStaffInvitationInput {
  to: string;
  schoolName: string;
  roleName: string;
  invitationToken: string;
  expiresAt: Date;
}

function getBaseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function sendStaffInvitationEmail(input: SendStaffInvitationInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { sent: false as const, reason: "email_not_configured" as const };

  const url = `${getBaseUrl()}/invite/${input.invitationToken}`;
  const expiry = input.expiresAt.toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" });
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: `Undangan ${input.roleName} untuk ${input.schoolName}`,
    text: [
      `Anda diundang bergabung ke ${input.schoolName} sebagai ${input.roleName}.`,
      `Aktifkan akun melalui tautan berikut: ${url}`,
      `Tautan berlaku sampai ${expiry} WIB.`,
    ].join("\n\n"),
  });

  if (error) return { sent: false as const, reason: "provider_error" as const };
  return { sent: true as const, id: data?.id ?? null };
}
