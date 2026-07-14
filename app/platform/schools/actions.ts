"use server";

import { SchoolStatus } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { sendSchoolInvitationEmail } from "@/lib/email/send-school-invitation";
import { prisma } from "@/lib/prisma";
import { provisionSchoolAccess } from "@/lib/school/provision-access";

const createSchoolSchema = z.object({
  name: z.string().trim().min(3).max(120),
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9-]+$/),
  slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9-]+$/),
  email: z.string().trim().email().or(z.literal("")),
  phone: z.string().trim().max(30),
  ownerEmail: z.string().trim().toLowerCase().email(),
  studentLimit: z.coerce.number().int().min(1).max(100000),
  userLimit: z.coerce.number().int().min(1).max(10000),
  trialDays: z.coerce.number().int().min(0).max(365),
});

async function requirePlatformOwner() {
  const session = await auth();
  if (!session?.user?.id || session.user.platformRole !== "OWNER") redirect("/login");
  return session.user;
}

export async function createSchool(formData: FormData) {
  const actor = await requirePlatformOwner();
  const parsed = createSchoolSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/platform/schools/new?error=invalid");

  const input = parsed.data;
  const duplicate = await prisma.school.findFirst({
    where: { OR: [{ code: input.code.toUpperCase() }, { slug: input.slug }] },
    select: { id: true },
  });
  if (duplicate) redirect("/platform/schools/new?error=duplicate");

  const invitationToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(invitationToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 86400000);

  const school = await prisma.$transaction(async (tx) => {
    const created = await tx.school.create({
      data: {
        name: input.name,
        code: input.code.toUpperCase(),
        slug: input.slug,
        email: input.email || null,
        phone: input.phone || null,
        status: input.trialDays > 0 ? SchoolStatus.TRIAL : SchoolStatus.ACTIVE,
        trialEndsAt: input.trialDays > 0 ? new Date(Date.now() + input.trialDays * 86400000) : null,
        studentLimit: input.studentLimit,
        userLimit: input.userLimit,
        settings: { create: {} },
      },
    });

    await provisionSchoolAccess(tx, created.id);
    await tx.invitation.create({
      data: {
        schoolId: created.id,
        email: input.ownerEmail,
        tokenHash,
        expiresAt,
        invitedById: actor.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        schoolId: created.id,
        action: "school.created",
        entityType: "School",
        entityId: created.id,
        newValue: { name: created.name, code: created.code, status: created.status, ownerEmail: input.ownerEmail },
      },
    });
    return created;
  });

  const emailResult = await sendSchoolInvitationEmail({
    to: input.ownerEmail,
    schoolName: school.name,
    invitationToken,
    expiresAt,
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      schoolId: school.id,
      action: emailResult.sent ? "invitation.email_sent" : "invitation.email_failed",
      entityType: "Invitation",
      reason: emailResult.sent ? null : emailResult.reason,
      metadata: {
        recipient: input.ownerEmail,
        providerMessageId: emailResult.sent ? emailResult.id : null,
      },
    },
  });

  revalidatePath("/platform");
  revalidatePath("/platform/schools");
  const emailStatus = emailResult.sent ? "sent" : emailResult.reason;
  redirect(`/platform/schools/${school.id}?invite=${invitationToken}&email=${emailStatus}`);
}

const statusSchema = z.object({
  schoolId: z.string().cuid(),
  status: z.nativeEnum(SchoolStatus),
  reason: z.string().trim().min(3).max(500),
});

export async function changeSchoolStatus(formData: FormData) {
  const actor = await requirePlatformOwner();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const current = await prisma.school.findUniqueOrThrow({ where: { id: parsed.data.schoolId } });
  await prisma.$transaction([
    prisma.school.update({
      where: { id: current.id },
      data: {
        status: parsed.data.status,
        suspendedAt: parsed.data.status === "SUSPENDED" ? new Date() : null,
        suspensionReason: parsed.data.status === "SUSPENDED" ? parsed.data.reason : null,
        archivedAt: parsed.data.status === "ARCHIVED" ? new Date() : null,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: actor.id,
        schoolId: current.id,
        action: "school.status_changed",
        entityType: "School",
        entityId: current.id,
        reason: parsed.data.reason,
        oldValue: { status: current.status },
        newValue: { status: parsed.data.status },
      },
    }),
  ]);

  revalidatePath("/platform");
  revalidatePath("/platform/schools");
  revalidatePath(`/platform/schools/${current.id}`);
}
