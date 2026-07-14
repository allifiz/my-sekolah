"use server";

import { InvitationStatus, MembershipStatus } from "@prisma/client";
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

export async function acceptInvitation(formData: FormData) {
  const parsed = acceptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/invite/${String(formData.get("token") ?? "")}?error=invalid`);

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: { school: true },
  });

  if (!invitation || invitation.status !== InvitationStatus.PENDING || invitation.expiresAt <= new Date()) {
    redirect(`/invite/${parsed.data.token}?error=expired`);
  }

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

    const ownerRole = await tx.role.findUniqueOrThrow({
      where: { schoolId_key: { schoolId: invitation.schoolId, key: "school-owner" } },
    });
    await tx.memberRole.upsert({
      where: { memberId_roleId: { memberId: member.id, roleId: ownerRole.id } },
      update: {},
      create: { memberId: member.id, roleId: ownerRole.id },
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        schoolId: invitation.schoolId,
        action: "invitation.accepted",
        entityType: "Invitation",
        entityId: invitation.id,
        metadata: { email: invitation.email },
      },
    });
  });

  redirect(`/login?accepted=1&email=${encodeURIComponent(invitation.email)}`);
}
