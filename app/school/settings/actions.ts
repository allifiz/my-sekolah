"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const optionalText = z.preprocess((value) => {
  const text = String(value ?? "").trim();
  return text === "" ? undefined : text;
}, z.string().max(500).optional());

const settingsSchema = z.object({
  name: z.string().trim().min(3).max(160),
  email: z.preprocess((value) => String(value ?? "").trim() || undefined, z.string().email().optional()),
  phone: optionalText,
  address: optionalText,
  timezone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]),
  receiptPrefix: z.string().trim().min(2).max(12).regex(/^[A-Za-z0-9-]+$/).transform((value) => value.toUpperCase()),
  defaultLocale: z.enum(["id-ID", "en-US"]),
});

async function requireManager() {
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

export async function updateSchoolSettings(formData: FormData) {
  const actor = await requireManager();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/settings?error=invalid-settings");

  const before = await prisma.school.findUnique({ where: { id: actor.schoolId }, include: { settings: true } });
  if (!before) redirect("/login");

  await prisma.$transaction(async (tx) => {
    await tx.school.update({
      where: { id: actor.schoolId },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        address: parsed.data.address,
        timezone: parsed.data.timezone,
      },
    });
    await tx.schoolSettings.upsert({
      where: { schoolId: actor.schoolId },
      update: {
        receiptPrefix: parsed.data.receiptPrefix,
        attendanceTimezone: parsed.data.timezone,
        defaultLocale: parsed.data.defaultLocale,
      },
      create: {
        schoolId: actor.schoolId,
        receiptPrefix: parsed.data.receiptPrefix,
        attendanceTimezone: parsed.data.timezone,
        defaultLocale: parsed.data.defaultLocale,
      },
    });
    await tx.auditLog.create({
      data: {
        schoolId: actor.schoolId,
        actorId: actor.actorId,
        action: "school.settings_updated",
        entityType: "School",
        entityId: actor.schoolId,
        oldValue: {
          name: before.name,
          email: before.email,
          phone: before.phone,
          address: before.address,
          timezone: before.timezone,
          receiptPrefix: before.settings?.receiptPrefix,
          defaultLocale: before.settings?.defaultLocale,
        },
        newValue: parsed.data,
      },
    });
  });

  revalidatePath("/school/settings");
  revalidatePath("/school");
  redirect("/school/settings?success=updated");
}
