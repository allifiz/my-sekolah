"use server";

import { SchoolStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const createSchoolSchema = z.object({
  name: z.string().trim().min(3).max(120),
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9-]+$/),
  slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9-]+$/),
  email: z.string().trim().email().or(z.literal("")),
  phone: z.string().trim().max(30),
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

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        schoolId: created.id,
        action: "school.created",
        entityType: "School",
        entityId: created.id,
        newValue: { name: created.name, code: created.code, status: created.status },
      },
    });
    return created;
  });

  revalidatePath("/platform");
  revalidatePath("/platform/schools");
  redirect(`/platform/schools/${school.id}`);
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
