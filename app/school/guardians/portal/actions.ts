"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { sendGuardianInvitationEmail } from "@/lib/email/send-guardian-invitation";
import { prisma } from "@/lib/prisma";

const schema = z.object({ guardianId: z.string().cuid(), email: z.string().trim().toLowerCase().email() });

export async function inviteGuardian(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const member = await prisma.schoolMember.findFirst({
    where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal"] } } } } },
    select: { id: true },
  });
  if (!member) redirect("/school?error=forbidden");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/guardians/portal?error=invalid");
  const guardian = await prisma.guardian.findFirst({ where: { id: parsed.data.guardianId, schoolId: session.user.schoolId, deletedAt: null } });
  if (!guardian) redirect("/school/guardians/portal?error=not-found");

  const existing = await prisma.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "GuardianAccount" WHERE "guardianId" = ${guardian.id} LIMIT 1`;
  if (existing.length) redirect("/school/guardians/portal?error=already-active");

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  await prisma.$executeRaw`INSERT INTO "GuardianInvitation" ("id","guardianId","schoolId","email","tokenHash","expiresAt","createdById","createdAt") VALUES (${randomUUID()},${guardian.id},${session.user.schoolId},${parsed.data.email},${tokenHash},${expiresAt},${session.user.id},NOW())`;
  await prisma.guardian.update({ where: { id: guardian.id }, data: { email: parsed.data.email } });
  const school = await prisma.school.findUnique({ where: { id: session.user.schoolId }, select: { name: true } });
  const result = await sendGuardianInvitationEmail({ to: parsed.data.email, guardianName: guardian.name, schoolName: school?.name ?? "Sekolah", token, expiresAt });
  await prisma.auditLog.create({ data: { schoolId: session.user.schoolId, actorId: session.user.id, action: "guardian_portal.invited", entityType: "Guardian", entityId: guardian.id, newValue: { email: parsed.data.email, sent: result.sent } } });
  redirect(`/school/guardians/portal?success=${result.sent ? "sent" : "created"}`);
}