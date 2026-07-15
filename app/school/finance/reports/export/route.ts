import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function monthBounds(month: string) {
  const valid = /^\d{4}-\d{2}$/.test(month) ? month : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  const start = new Date(`${valid}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { valid, start, end };
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.schoolId) return new NextResponse("Unauthorized", { status: 401 });

  const member = await prisma.schoolMember.findFirst({
    where: { schoolId: session.user.schoolId, userId: session.user.id, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["school-owner", "school-admin", "principal", "finance"] } } } } },
    select: { id: true },
  });
  if (!member) return new NextResponse("Forbidden", { status: 403 });

  const { searchParams } = request.nextUrl;
  const { valid: month, start, end } = monthBounds(searchParams.get("month") ?? "");
  const requestedStudentId = searchParams.get("studentId") ?? "";
  const studentId = /^c[a-z0-9]+$/i.test(requestedStudentId) ? requestedStudentId : undefined;

  const invoices = await prisma.invoice.findMany({
    where: { schoolId: session.user.schoolId, ...(studentId ? { studentId } : {}), OR: [{ issueDate: { gte: start, lt: end } }, { status: { in: ["ISSUED", "PARTIALLY_PAID"] } }] },
    include: { student: true, items: { include: { feeCategory: true } }, allocations: { include: { payment: true } } },
    orderBy: [{ student: { name: "asc" } }, { issueDate: "asc" }],
  });

  const headers = ["invoice_number", "student_nis", "student_name", "title", "category", "issue_date", "due_date", "status", "total_amount", "paid_amount", "outstanding", "payment_receipts"];
  const rows = invoices.map((invoice) => [
    invoice.number,
    invoice.student.nis,
    invoice.student.name,
    invoice.title,
    invoice.items.map((item) => item.feeCategory?.name ?? item.description).join("; "),
    invoice.issueDate.toISOString().slice(0, 10),
    invoice.dueDate.toISOString().slice(0, 10),
    invoice.status,
    invoice.totalAmount.toString(),
    invoice.paidAmount.toString(),
    invoice.totalAmount.minus(invoice.paidAmount).toString(),
    invoice.allocations.map((allocation) => allocation.payment.receiptNumber).join("; "),
  ]);

  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laporan-keuangan-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
