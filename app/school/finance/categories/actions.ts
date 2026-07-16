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

const categorySchema = z.object({
  code: z.string().trim().min(1).max(30).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(120),
  description: optionalText,
});

async function requireFinanceManager() {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");
  const member = await prisma.schoolMember.findFirst({ where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal", "finance"] } } } } }, select: { id: true } });
  if (!member) redirect("/school?error=forbidden");
  return { actorId: session.user.id, schoolId: session.user.schoolId };
}

export async function createFeeCategory(formData: FormData) {
  const actor = await requireFinanceManager();
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/finance/categories?error=invalid-category");

  const duplicate = await prisma.feeCategory.findFirst({
    where: { schoolId: actor.schoolId, OR: [{ code: parsed.data.code }, { name: parsed.data.name }] },
    select: { id: true },
  });
  if (duplicate) redirect("/school/finance/categories?error=duplicate-category");

  const category = await prisma.feeCategory.create({ data: { schoolId: actor.schoolId, ...parsed.data } });
  await prisma.auditLog.create({
    data: {
      schoolId: actor.schoolId,
      actorId: actor.actorId,
      action: "fee_category.created",
      entityType: "FeeCategory",
      entityId: category.id,
      newValue: { code: category.code, name: category.name, description: category.description },
    },
  });

  revalidatePath("/school/finance");
  revalidatePath("/school/finance/categories");
  redirect("/school/finance/categories?success=created");
}

export async function deleteFeeCategory(formData: FormData) {
  const actor = await requireFinanceManager();
  const parsed = z.string().cuid().safeParse(formData.get("feeCategoryId"));
  if (!parsed.success) redirect("/school/finance/categories?error=invalid-request");
  const category = await prisma.feeCategory.findFirst({ where: { id: parsed.data, schoolId: actor.schoolId }, include: { _count: { select: { items: true } } } });
  if (!category) redirect("/school/finance/categories?error=not-found");
  if (category._count.items > 0) redirect("/school/finance/categories?error=category-in-use");
  await prisma.$transaction([
    prisma.feeCategory.delete({ where: { id: category.id } }),
    prisma.auditLog.create({ data: { schoolId: actor.schoolId, actorId: actor.actorId, action: "fee_category.deleted", entityType: "FeeCategory", entityId: category.id, oldValue: { code: category.code, name: category.name, description: category.description } } }),
  ]);
  revalidatePath("/school/finance");
  revalidatePath("/school/finance/categories");
  redirect("/school/finance/categories?success=deleted");
}
