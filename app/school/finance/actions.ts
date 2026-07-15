"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const optionalText = z.preprocess((value) => {
  const text = String(value ?? "").trim();
  return text === "" ? undefined : text;
}, z.string().max(500).optional());

const requiredReason = z.string().trim().min(5).max(500);

const dateField = z.preprocess((value) => {
  const text = String(value ?? "").trim();
  return new Date(`${text}T00:00:00.000Z`);
}, z.date());

const moneyField = z.preprocess((value) => {
  const normalized = String(value ?? "").replace(/[^0-9]/g, "");
  return Number(normalized);
}, z.number().int().positive().max(1_000_000_000));

const categorySchema = z.object({
  code: z.string().trim().min(1).max(30).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(120),
  description: optionalText,
});

const invoiceSchema = z.object({
  studentId: z.string().cuid(),
  feeCategoryId: z.string().cuid(),
  title: z.string().trim().min(2).max(160),
  description: optionalText,
  issueDate: dateField,
  dueDate: dateField,
  amount: moneyField,
});

const bulkInvoiceSchema = z.object({
  classGroupId: z.string().cuid(),
  feeCategoryId: z.string().cuid(),
  title: z.string().trim().min(2).max(160),
  description: optionalText,
  issueDate: dateField,
  dueDate: dateField,
  amount: moneyField,
});

const paymentSchema = z.object({
  invoiceId: z.string().cuid(),
  paidAt: dateField,
  method: z.enum(["CASH", "TRANSFER", "QRIS", "OTHER"]),
  amount: moneyField,
  reference: optionalText,
  note: optionalText,
});

async function requireFinanceManager() {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) redirect("/login");

  const member = await prisma.schoolMember.findFirst({
    where: {
      schoolId: session.user.schoolId,
      userId: session.user.id,
      status: "ACTIVE",
      deletedAt: null,
      roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal", "finance"] } } } },
    },
    select: { id: true },
  });
  if (!member) redirect("/school?error=forbidden");
  return { actorId: session.user.id, memberId: member.id, schoolId: session.user.schoolId };
}

function makeDocumentNumber(prefix: string, suffix = "") {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}-${now.getTime().toString().slice(-7)}${suffix}`;
}

export async function createFeeCategory(formData: FormData) {
  const actor = await requireFinanceManager();
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/finance?error=invalid-category");

  const duplicate = await prisma.feeCategory.findFirst({
    where: { schoolId: actor.schoolId, OR: [{ code: parsed.data.code }, { name: parsed.data.name }] },
    select: { id: true },
  });
  if (duplicate) redirect("/school/finance?error=duplicate-category");

  const category = await prisma.feeCategory.create({ data: { schoolId: actor.schoolId, ...parsed.data } });
  await prisma.auditLog.create({
    data: { schoolId: actor.schoolId, actorId: actor.actorId, action: "fee_category.created", entityType: "FeeCategory", entityId: category.id, newValue: { code: category.code, name: category.name } },
  });
  revalidatePath("/school/finance");
  redirect("/school/finance?success=category-created");
}

export async function createInvoice(formData: FormData) {
  const actor = await requireFinanceManager();
  const parsed = invoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.dueDate < parsed.data.issueDate) redirect("/school/finance?error=invalid-invoice");

  const [student, category] = await Promise.all([
    prisma.student.findFirst({ where: { id: parsed.data.studentId, schoolId: actor.schoolId, deletedAt: null } }),
    prisma.feeCategory.findFirst({ where: { id: parsed.data.feeCategoryId, schoolId: actor.schoolId, isActive: true } }),
  ]);
  if (!student || !category) redirect("/school/finance?error=reference-not-found");

  const number = makeDocumentNumber("INV");
  const amount = new Prisma.Decimal(parsed.data.amount);
  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: { schoolId: actor.schoolId, studentId: student.id, number, title: parsed.data.title, description: parsed.data.description, issueDate: parsed.data.issueDate, dueDate: parsed.data.dueDate, totalAmount: amount, createdById: actor.memberId },
    });
    await tx.invoiceItem.create({
      data: { schoolId: actor.schoolId, invoiceId: created.id, feeCategoryId: category.id, description: parsed.data.title, quantity: 1, unitAmount: amount, totalAmount: amount },
    });
    return created;
  });

  await prisma.auditLog.create({
    data: { schoolId: actor.schoolId, actorId: actor.actorId, action: "invoice.issued", entityType: "Invoice", entityId: invoice.id, newValue: { number, student: student.name, amount: parsed.data.amount, dueDate: parsed.data.dueDate.toISOString() } },
  });
  revalidatePath("/school/finance");
  redirect("/school/finance?success=invoice-created");
}

export async function createBulkInvoices(formData: FormData) {
  const actor = await requireFinanceManager();
  const parsed = bulkInvoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.dueDate < parsed.data.issueDate) redirect("/school/finance/bulk?error=invalid-invoice");

  const [classGroup, category] = await Promise.all([
    prisma.classGroup.findFirst({
      where: { id: parsed.data.classGroupId, schoolId: actor.schoolId, isActive: true },
      include: { enrollments: { where: { status: "ACTIVE", student: { status: "ACTIVE", deletedAt: null } }, include: { student: true } } },
    }),
    prisma.feeCategory.findFirst({ where: { id: parsed.data.feeCategoryId, schoolId: actor.schoolId, isActive: true } }),
  ]);
  if (!classGroup || !category) redirect("/school/finance/bulk?error=reference-not-found");
  if (classGroup.enrollments.length === 0) redirect("/school/finance/bulk?error=no-students");

  const existing = await prisma.invoice.findMany({
    where: {
      schoolId: actor.schoolId,
      studentId: { in: classGroup.enrollments.map((item) => item.studentId) },
      title: parsed.data.title,
      issueDate: parsed.data.issueDate,
      status: { not: "VOID" },
    },
    select: { studentId: true },
  });
  const existingIds = new Set(existing.map((item) => item.studentId));
  const targets = classGroup.enrollments.filter((item) => !existingIds.has(item.studentId));
  if (targets.length === 0) redirect("/school/finance/bulk?error=all-duplicate");

  const amount = new Prisma.Decimal(parsed.data.amount);
  const batchStamp = Date.now().toString().slice(-7);
  const createdIds = await prisma.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const [index, enrollment] of targets.entries()) {
      const number = `INV-${parsed.data.issueDate.toISOString().slice(0, 10).replaceAll("-", "")}-${batchStamp}-${String(index + 1).padStart(3, "0")}`;
      const invoice = await tx.invoice.create({
        data: { schoolId: actor.schoolId, studentId: enrollment.studentId, number, title: parsed.data.title, description: parsed.data.description, issueDate: parsed.data.issueDate, dueDate: parsed.data.dueDate, totalAmount: amount, createdById: actor.memberId },
      });
      await tx.invoiceItem.create({
        data: { schoolId: actor.schoolId, invoiceId: invoice.id, feeCategoryId: category.id, description: parsed.data.title, quantity: 1, unitAmount: amount, totalAmount: amount },
      });
      ids.push(invoice.id);
    }
    await tx.auditLog.create({
      data: { schoolId: actor.schoolId, actorId: actor.actorId, action: "invoice.bulk_issued", entityType: "InvoiceBatch", newValue: { classGroupId: classGroup.id, title: parsed.data.title, amount: parsed.data.amount, createdCount: ids.length, skippedDuplicates: existingIds.size, invoiceIds: ids } },
    });
    return ids;
  });

  revalidatePath("/school/finance");
  revalidatePath("/school/finance/reports");
  redirect(`/school/finance/bulk?success=created&count=${createdIds.length}`);
}

export async function recordPayment(formData: FormData) {
  const actor = await requireFinanceManager();
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/school/finance?error=invalid-payment");

  const invoice = await prisma.invoice.findFirst({
    where: { id: parsed.data.invoiceId, schoolId: actor.schoolId, status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
    include: { student: true },
  });
  if (!invoice) redirect("/school/finance?error=invoice-not-found");

  const outstanding = invoice.totalAmount.minus(invoice.paidAmount);
  const amount = new Prisma.Decimal(parsed.data.amount);
  if (amount.greaterThan(outstanding)) redirect("/school/finance?error=overpayment");

  const settings = await prisma.schoolSettings.findUnique({ where: { schoolId: actor.schoolId }, select: { receiptPrefix: true } });
  const receiptNumber = makeDocumentNumber(settings?.receiptPrefix ?? "RCT");

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: { schoolId: actor.schoolId, receiptNumber, paidAt: parsed.data.paidAt, method: parsed.data.method, amount, reference: parsed.data.reference, note: parsed.data.note, recordedById: actor.memberId },
    });
    await tx.paymentAllocation.create({ data: { schoolId: actor.schoolId, paymentId: created.id, invoiceId: invoice.id, amount } });
    const paidAmount = invoice.paidAmount.plus(amount);
    await tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount, status: paidAmount.equals(invoice.totalAmount) ? "PAID" : "PARTIALLY_PAID" } });
    return created;
  });

  await prisma.auditLog.create({
    data: { schoolId: actor.schoolId, actorId: actor.actorId, action: "payment.recorded", entityType: "Payment", entityId: payment.id, newValue: { receiptNumber, invoiceNumber: invoice.number, student: invoice.student.name, amount: parsed.data.amount, method: parsed.data.method } },
  });
  revalidatePath("/school/finance");
  redirect(`/school/finance/receipts/${payment.id}`);
}

export async function voidInvoice(formData: FormData) {
  const actor = await requireFinanceManager();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const reason = requiredReason.safeParse(formData.get("reason"));
  if (!z.string().cuid().safeParse(invoiceId).success || !reason.success) redirect("/school/finance?error=reason-required");

  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, schoolId: actor.schoolId }, include: { student: true } });
  if (!invoice || invoice.status === "VOID") redirect("/school/finance?error=invoice-not-found");
  if (!invoice.paidAmount.equals(0)) redirect("/school/finance?error=invoice-has-payment");

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id: invoice.id }, data: { status: "VOID" } });
    await tx.auditLog.create({
      data: { schoolId: actor.schoolId, actorId: actor.actorId, action: "invoice.voided", entityType: "Invoice", entityId: invoice.id, reason: reason.data, oldValue: { number: invoice.number, status: invoice.status, student: invoice.student.name, amount: invoice.totalAmount.toString() }, newValue: { status: "VOID" } },
    });
  });
  revalidatePath("/school/finance");
  revalidatePath("/school/finance/reports");
  redirect("/school/finance?success=invoice-voided");
}

export async function voidPayment(formData: FormData) {
  const actor = await requireFinanceManager();
  const paymentId = String(formData.get("paymentId") ?? "");
  const reason = requiredReason.safeParse(formData.get("reason"));
  if (!z.string().cuid().safeParse(paymentId).success || !reason.success) redirect("/school/finance?error=reason-required");

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, schoolId: actor.schoolId },
    include: { allocations: { include: { invoice: { include: { student: true } } } }, recordedBy: { include: { user: true } } },
  });
  if (!payment) redirect("/school/finance?error=payment-not-found");

  await prisma.$transaction(async (tx) => {
    for (const allocation of payment.allocations) {
      const restoredPaid = allocation.invoice.paidAmount.minus(allocation.amount);
      await tx.invoice.update({
        where: { id: allocation.invoiceId },
        data: { paidAmount: restoredPaid, status: restoredPaid.equals(0) ? "ISSUED" : "PARTIALLY_PAID" },
      });
    }
    await tx.payment.delete({ where: { id: payment.id } });
    await tx.auditLog.create({
      data: {
        schoolId: actor.schoolId,
        actorId: actor.actorId,
        action: "payment.voided",
        entityType: "Payment",
        entityId: payment.id,
        reason: reason.data,
        oldValue: { receiptNumber: payment.receiptNumber, paidAt: payment.paidAt.toISOString(), method: payment.method, amount: payment.amount.toString(), reference: payment.reference, note: payment.note, recordedBy: payment.recordedBy.user.email, allocations: payment.allocations.map((item) => ({ invoiceId: item.invoiceId, invoiceNumber: item.invoice.number, student: item.invoice.student.name, amount: item.amount.toString() })) },
        newValue: { voided: true },
      },
    });
  });
  revalidatePath("/school/finance");
  revalidatePath("/school/finance/reports");
  redirect("/school/finance?success=payment-voided");
}
