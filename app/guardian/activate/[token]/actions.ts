"use server";

import { createHash, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({ token: z.string().min(32), name: z.string().trim().min(3).max(120), password: z.string().min(12).max(128) });

export async function activateGuardian(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/guardian/activate/${String(formData.get("token") ?? "")}?error=invalid`);
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const invitations = await prisma.$queryRaw<Array<{ id: string; guardianId: string; schoolId: string; email: string; expiresAt: Date; acceptedAt: Date | null }>>`SELECT "id","guardianId","schoolId","email","expiresAt","acceptedAt" FROM "GuardianInvitation" WHERE "tokenHash" = ${tokenHash} LIMIT 1`;
  const invitation = invitations[0];
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) redirect(`/guardian/activate/${parsed.data.token}?error=expired`);
  const duplicate = await prisma.user.findUnique({ where: { email: invitation.email } });
  if (duplicate) redirect(`/guardian/activate/${parsed.data.token}?error=email-used`);
  const passwordHash = await hash(parsed.data.password, 12);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email: invitation.email, name: parsed.data.name, passwordHash, emailVerified: new Date() } });
    await tx.$executeRaw`INSERT INTO "GuardianAccount" ("id","guardianId","userId","schoolId","createdAt","updatedAt") VALUES (${randomUUID()},${invitation.guardianId},${user.id},${invitation.schoolId},NOW(),NOW())`;
    await tx.$executeRaw`UPDATE "GuardianInvitation" SET "acceptedAt" = NOW() WHERE "id" = ${invitation.id}`;
    await tx.auditLog.create({ data: { schoolId: invitation.schoolId, actorId: user.id, action: "guardian_portal.activated", entityType: "Guardian", entityId: invitation.guardianId, newValue: { email: invitation.email } } });
  });
  redirect("/login?success=guardian-activated");
}