"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { sendStaffInvitationEmail } from "@/lib/email/send-staff-invitation";
import { prisma } from "@/lib/prisma";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  roleKey: z.enum(["school-admin", "principal", "finance", "teacher", "homeroom-teacher"]),
});

const memberSchema = z.object({ memberId: z.string().cuid(), status: z.enum(["ACTIVE", "SUSPENDED", "LEFT"]) });

async function requireOwnerOrAdmin() {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const member = await prisma.schoolMember.findFirst({
    where: {
      schoolId: session.user.schoolId,
      userId: session.user.id,
      status: "ACTIVE",
      deletedAt: null,
      roles: { some: { role: { key: { in: ["school-owner", "school-admin"] } } } },
    },
    select: { id: true },
  });
  if (!member) redirect("/school?error=forbidden");
  return { actorId: session.user.id, schoolId: session.user.schoolId };
}

export async function inviteStaff(formData: FormData) {
  const actor = await requireOwnerOrAdmin();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/members?error=invalid-invitation");

  const [school, activeMembers, pendingInvites, role] = await Promise.all([
    prisma.school.findUnique({ where: { id: actor.schoolId }, select: { name: true, userLimit: true } }),
    prisma.schoolMember.count({ where: { schoolId: actor.schoolId, status: { in: ["ACTIVE", "INVITED"] }, deletedAt: null } }),
    prisma.invitation.count({ where: { schoolId: actor.schoolId, email: parsed.data.email, status: "PENDING", expiresAt: { gt: new Date() } } }),
    prisma.role.findUnique({ where: { schoolId_key: { schoolId: actor.schoolId, key: parsed.data.roleKey } }, select: { name: true } }),
  ]);
  if (!school || !role) redirect("/school/members?error=reference-not-found");
  if (activeMembers >= school.userLimit) redirect("/school/members?error=user-limit");
  if (pendingInvites > 0) redirect("/school/members?error=duplicate-invitation");

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existing) {
    const member = await prisma.schoolMember.findUnique({ where: { schoolId_userId: { schoolId: actor.schoolId, userId: existing.id } } });
    if (member && member.status !== "LEFT") redirect("/school/members?error=already-member");
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const id = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "Invitation" ("id", "schoolId", "email", "tokenHash", "status", "expiresAt", "invitedById", "createdAt", "updatedAt", "roleKey")
    VALUES (${id}, ${actor.schoolId}, ${parsed.data.email}, ${tokenHash}, 'PENDING'::"InvitationStatus", ${expiresAt}, ${actor.actorId}, NOW(), NOW(), ${parsed.data.roleKey})
  `;

  const delivery = await sendStaffInvitationEmail({ to: parsed.data.email, schoolName: school.name, roleName: role.name, invitationToken: token, expiresAt });
  await prisma.auditLog.create({
    data: {
      schoolId: actor.schoolId,
      actorId: actor.actorId,
      action: "staff.invited",
      entityType: "Invitation",
      entityId: id,
      metadata: { email: parsed.data.email, roleKey: parsed.data.roleKey, emailSent: delivery.sent },
    },
  });
  revalidatePath("/school/members");
  redirect(`/school/members?success=invited&delivery=${delivery.sent ? "sent" : "pending"}`);
}

export async function revokeInvitation(formData: FormData) {
  const actor = await requireOwnerOrAdmin();
  const invitationId = String(formData.get("invitationId") ?? "");
  const invitation = await prisma.invitation.findFirst({ where: { id: invitationId, schoolId: actor.schoolId, status: "PENDING" } });
  if (!invitation) redirect("/school/members?error=invitation-not-found");
  await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "REVOKED" } });
  await prisma.auditLog.create({ data: { schoolId: actor.schoolId, actorId: actor.actorId, action: "staff.invitation_revoked", entityType: "Invitation", entityId: invitation.id, metadata: { email: invitation.email } } });
  revalidatePath("/school/members");
  redirect("/school/members?success=invitation-revoked");
}

export async function updateMemberStatus(formData: FormData) {
  const actor = await requireOwnerOrAdmin();
  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/members?error=invalid-member");
  const member = await prisma.schoolMember.findFirst({ where: { id: parsed.data.memberId, schoolId: actor.schoolId, deletedAt: null }, include: { roles: { include: { role: true } }, user: true } });
  if (!member) redirect("/school/members?error=member-not-found");
  const isOwner = member.roles.some(({ role }) => role.key === "school-owner");
  if (isOwner && parsed.data.status !== "ACTIVE") {
    const ownerCount = await prisma.schoolMember.count({ where: { schoolId: actor.schoolId, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: "school-owner" } } } } });
    if (ownerCount <= 1) redirect("/school/members?error=last-owner");
  }
  const oldStatus = member.status;
  await prisma.schoolMember.update({ where: { id: member.id }, data: { status: parsed.data.status, deletedAt: parsed.data.status === "LEFT" ? new Date() : null } });
  await prisma.auditLog.create({ data: { schoolId: actor.schoolId, actorId: actor.actorId, action: "staff.status_updated", entityType: "SchoolMember", entityId: member.id, oldValue: { status: oldStatus }, newValue: { status: parsed.data.status }, metadata: { email: member.user.email } } });
  revalidatePath("/school/members");
  redirect("/school/members?success=member-updated");
}
