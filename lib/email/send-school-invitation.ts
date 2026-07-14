import { Resend } from "resend";

interface SendSchoolInvitationInput {
  to: string;
  schoolName: string;
  invitationToken: string;
  expiresAt: Date;
}

function getBaseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendSchoolInvitationEmail(input: SendSchoolInvitationInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    return { sent: false as const, reason: "email_not_configured" as const };
  }

  const resend = new Resend(apiKey);
  const invitationUrl = `${getBaseUrl()}/invite/${input.invitationToken}`;
  const schoolName = escapeHtml(input.schoolName);
  const expiry = input.expiresAt.toLocaleString("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });

  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: `Undangan mengelola ${input.schoolName} di My Sekolah`,
    text: [
      `Anda diundang menjadi School Owner untuk ${input.schoolName}.`,
      `Aktifkan akun melalui tautan berikut: ${invitationUrl}`,
      `Tautan berlaku sampai ${expiry} WIB.`,
      "Abaikan email ini jika Anda tidak mengenali undangan tersebut.",
    ].join("\n\n"),
    html: `
      <div style="background:#f4f4f5;padding:32px 16px;font-family:Arial,sans-serif;color:#18181b">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px">
          <p style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#71717a;margin:0 0 16px">My Sekolah</p>
          <h1 style="font-size:26px;line-height:1.2;margin:0 0 16px">Undangan School Owner</h1>
          <p style="font-size:16px;line-height:1.7;color:#3f3f46">Anda diundang untuk mengelola <strong>${schoolName}</strong> sebagai School Owner.</p>
          <p style="margin:28px 0">
            <a href="${invitationUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">Aktifkan akun</a>
          </p>
          <p style="font-size:14px;line-height:1.6;color:#71717a">Tautan ini berlaku sampai ${expiry} WIB. Jika tombol tidak bekerja, salin tautan berikut:</p>
          <p style="font-size:13px;line-height:1.6;word-break:break-all;color:#52525b">${invitationUrl}</p>
          <hr style="border:0;border-top:1px solid #e4e4e7;margin:28px 0" />
          <p style="font-size:12px;line-height:1.6;color:#a1a1aa;margin:0">Abaikan email ini jika Anda tidak mengenali undangan tersebut.</p>
        </div>
      </div>
    `,
  });

  if (error) {
    console.error("Gagal mengirim invitation email", error);
    return { sent: false as const, reason: "provider_error" as const };
  }

  return { sent: true as const, id: data?.id ?? null };
}
