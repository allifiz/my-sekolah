"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const passwordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(10).max(128),
  confirmPassword: z.string().min(10).max(128),
}).refine((value) => value.newPassword === value.confirmPassword, {
  message: "Password baru tidak sama.",
  path: ["confirmPassword"],
});

export async function changePassword(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/account/security?error=invalid-password");
  if (parsed.data.currentPassword === parsed.data.newPassword) redirect("/account/security?error=password-unchanged");

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { passwordHash: true, email: true } });
  if (!user?.passwordHash) redirect("/account/security?error=password-unavailable");

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) redirect("/account/security?error=current-password");

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: session.user.id }, data: { passwordHash } }),
    prisma.auditLog.create({
      data: {
        schoolId: session.user.schoolId ?? null,
        actorId: session.user.id,
        action: "account.password_changed",
        entityType: "User",
        entityId: session.user.id,
        metadata: { email: user.email },
      },
    }),
  ]);

  redirect("/account/security?success=password-changed");
}
