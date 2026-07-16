"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireFinanceManager() {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const member = await prisma.schoolMember.findFirst({ where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal", "finance"] } } } } }, select: { id: true } });
  if (!member) redirect("/school?error=forbidden");
  return { actorId: session.user.id, schoolId: session.user.schoolId };
}

export async function deleteFeeCategory(formData: FormData) {
  const actor = await requireFinanceManager();
  const parsed = z.string().cuid().safeParse(formData.get("feeCategoryId"));
  if (!parsed.success) redirect("/school/finance/categories?error=invalid-request");
  const category = await prisma.feeCategory.findFirst({ where: { id: parsed.data, schoolId: actor.schoolId }, include: { _count: { select: { invoiceItems: true } } } });
  if (!category) redirect("/school/finance/categories?error=not-found");
  if (category._count.invoiceItems > 0) redirect("/school/finance/categories?error=category-in-use");
  await prisma.$transaction([
    prisma.feeCategory.delete({ where: { id: category.id } }),
    prisma.auditLog.create({ data: { schoolId: actor.schoolId, actorId: actor.actorId, action: "fee_category.deleted", entityType: "FeeCategory", entityId: category.id, oldValue: { code: category.code, name: category.name, description: category.description } } }),
  ]);
  revalidatePath("/school/finance");
  revalidatePath("/school/finance/categories");
  redirect("/school/finance/categories?success=deleted");
}
