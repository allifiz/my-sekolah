"use server";

import { InvitationStatus, MembershipStatus, Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const acceptSchema = z.object({
  token: z.string().min(20),
  name: z.string().trim().min(3).max(120),
  password: z.string().min(12).max(128),
});

type InvitationWithRole = {
  id: string;
  schoolId: string;
  email: string;
  status: InvitationStatus;
  expiresAt: Date;
  roleKey: string;
};

export async function acceptInvitation(formData: FormData) {
  const parsed = acceptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/invite/${String(formData.get("token") ?? "")}?error=invalid`);

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const rows = await prisma.$queryRaw<InvitationWithRole[]>(Prisma.sql`
    SELECT "id", "schoolId", "email", "status", "expiresAt", "roleKey"
    FROM "Invitation"
    WHERE "tokenHash" = ${tokenHash}
    LIMIT 1
  `);
  const invitation = rows[0];

  if (!invitation || invitation.status !== InvitationStatus.PENDING || invitation.expiresAt <= new Date()) {
    redirect(`/invite/${parsed.data.token}?error=expired`);
  }

  const [school, role] = await Promise.all([
    prisma.school.findUnique({ where: { id: invitation.schoolId }, select: { status: true, userLimit: true } }),
    prisma.role.findUnique({ where: { schoolId_key: { schoolId: invitation.schoolId, key: invitation.roleKey } } }),
  ]);
  if (!school || !role || ["SUSPENDED", "CANCELLED", "ARCHIVED"].includes(school.status)) redirect(`/invite/${parsed.data.token}?error=unavailable`);

  const activeMembers = await prisma.schoolMember.count({ where: { schoolId: invitation.schoolId, status: { in: ["ACTIVE", "INVITED"] }, deletedAt: null } });
  if (activeMembers >= school.userLimit) redirect(`/invite/${parsed.data.token}?error=limit`);

  const passwordHash = await hash(parsed.data.password, 12);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: invitation.email },
      update: { name: parsed.data.name, passwordHash, emailVerified: new Date(), deletedAt: null },
      create: { email: invitation.email, name: parsed.data.name, passwordHash, emailVerified: new Date() },
    });

    const member = await tx.schoolMember.upsert({
      where: { schoolId_userId: { schoolId: invitation.schoolId, userId: user.id } },
      update: { status: MembershipStatus.ACTIVE, joinedAt: new Date(), deletedAt: null },
      create: { schoolId: invitation.schoolId, userId: user.id, status: MembershipStatus.ACTIVE, joinedAt: new Date() },
    });

    await tx.memberRole.deleteMany({ where: { memberId: member.id } });
    await tx.memberRole.create({ data: { memberId: member.id, roleId: role.id } });
    await tx.invitation.update({ where: { id: invitation.id }, data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        schoolId: invitation.schoolId,
        action: "invitation.accepted",
        entityType: "Invitation",
        entityId: invitation.id,
        metadata: { email: invitation.email, roleKey: invitation.roleKey },
      },
    });
  });

  redirect(`/login?accepted=1&email=${encodeURIComponent(invitation.email)}`);
}
