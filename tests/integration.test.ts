import assert from "node:assert/strict";
import { after, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const schoolIds: string[] = [];
const userIds: string[] = [];

async function createSchoolFixture(label: string) {
  const school = await prisma.school.create({
    data: {
      code: `T-${label}-${runId}`.slice(0, 30),
      slug: `test-${label}-${runId}`,
      name: `Test School ${label}`,
      status: "ACTIVE",
      subscriptionEndsAt: new Date("2099-12-31T00:00:00.000Z"),
      settings: { create: {} },
    },
  });
  schoolIds.push(school.id);

  const user = await prisma.user.create({
    data: { email: `${label}-${runId}@example.test`, name: `Tester ${label}` },
  });
  userIds.push(user.id);

  const member = await prisma.schoolMember.create({
    data: { schoolId: school.id, userId: user.id, status: "ACTIVE", joinedAt: new Date() },
  });

  const year = await prisma.academicYear.create({
    data: {
      schoolId: school.id,
      name: `2026-${label}-${runId}`,
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2027-06-30T00:00:00.000Z"),
      isActive: true,
    },
  });
  const grade = await prisma.gradeLevel.create({
    data: { schoolId: school.id, code: `G-${label}`, name: `Grade ${label}`, order: 1 },
  });
  const classGroup = await prisma.classGroup.create({
    data: { schoolId: school.id, academicYearId: year.id, gradeLevelId: grade.id, name: `Class ${label}` },
  });
  const student = await prisma.student.create({
    data: { schoolId: school.id, nis: `NIS-${label}-${runId}`, name: `Student ${label}` },
  });
  await prisma.enrollment.create({
    data: { schoolId: school.id, studentId: student.id, academicYearId: year.id, classGroupId: classGroup.id },
  });

  return { school, user, member, year, grade, classGroup, student };
}

after(async () => {
  for (const schoolId of schoolIds.reverse()) {
    await prisma.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  }
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

test("tenant-scoped student and guardian queries never return another school's records", async () => {
  const first = await createSchoolFixture("tenant-a");
  const second = await createSchoolFixture("tenant-b");
  const guardian = await prisma.guardian.create({
    data: { schoolId: first.school.id, name: "Guardian A", email: `guardian-${runId}@example.test` },
  });
  await prisma.studentGuardian.create({
    data: { schoolId: first.school.id, studentId: first.student.id, guardianId: guardian.id, relationship: "Parent", isPrimary: true },
  });

  const visibleToFirst = await prisma.student.findMany({ where: { schoolId: first.school.id } });
  const visibleToSecond = await prisma.student.findMany({ where: { schoolId: second.school.id } });
  const guardianChildren = await prisma.studentGuardian.findMany({
    where: { schoolId: first.school.id, guardianId: guardian.id },
    select: { studentId: true },
  });

  assert.deepEqual(visibleToFirst.map((row) => row.id), [first.student.id]);
  assert.deepEqual(visibleToSecond.map((row) => row.id), [second.student.id]);
  assert.deepEqual(guardianChildren.map((row) => row.studentId), [first.student.id]);
});

test("attendance constraints reject duplicate sessions and preserve correction updates", async () => {
  const fixture = await createSchoolFixture("attendance");
  const date = new Date("2026-07-16T00:00:00.000Z");
  const session = await prisma.attendanceSession.create({
    data: { schoolId: fixture.school.id, classGroupId: fixture.classGroup.id, date, submittedById: fixture.member.id },
  });
  const record = await prisma.attendanceRecord.create({
    data: {
      schoolId: fixture.school.id,
      sessionId: session.id,
      studentId: fixture.student.id,
      recordedById: fixture.member.id,
      status: "PRESENT",
    },
  });

  await assert.rejects(
    prisma.attendanceSession.create({
      data: { schoolId: fixture.school.id, classGroupId: fixture.classGroup.id, date, submittedById: fixture.member.id },
    }),
  );

  const corrected = await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: { status: "SICK", note: "Doctor note" },
  });
  assert.equal(corrected.status, "SICK");
  assert.equal(corrected.note, "Doctor note");
});

test("financial writes rollback atomically and successful allocation updates balance", async () => {
  const fixture = await createSchoolFixture("finance");
  const invoice = await prisma.invoice.create({
    data: {
      schoolId: fixture.school.id,
      studentId: fixture.student.id,
      number: `INV-${runId}`,
      title: "Tuition",
      issueDate: new Date("2026-07-01T00:00:00.000Z"),
      dueDate: new Date("2026-07-31T00:00:00.000Z"),
      totalAmount: new Prisma.Decimal(100000),
      paidAmount: new Prisma.Decimal(0),
      createdById: fixture.member.id,
    },
  });

  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          schoolId: fixture.school.id,
          receiptNumber: `ROLLBACK-${runId}`,
          paidAt: new Date(),
          method: "CASH",
          amount: new Prisma.Decimal(25000),
          recordedById: fixture.member.id,
        },
      });
      await tx.paymentAllocation.create({
        data: { schoolId: fixture.school.id, paymentId: payment.id, invoiceId: invoice.id, amount: new Prisma.Decimal(25000) },
      });
      await tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount: new Prisma.Decimal(25000), status: "PARTIALLY_PAID" } });
      throw new Error("force rollback");
    }),
  );

  const afterRollback = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(afterRollback.paidAmount.toNumber(), 0);
  assert.equal(await prisma.payment.count({ where: { schoolId: fixture.school.id } }), 0);

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        schoolId: fixture.school.id,
        receiptNumber: `OK-${runId}`,
        paidAt: new Date(),
        method: "TRANSFER",
        amount: new Prisma.Decimal(25000),
        recordedById: fixture.member.id,
      },
    });
    await tx.paymentAllocation.create({
      data: { schoolId: fixture.school.id, paymentId: payment.id, invoiceId: invoice.id, amount: new Prisma.Decimal(25000) },
    });
    await tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount: new Prisma.Decimal(25000), status: "PARTIALLY_PAID" } });
  });

  const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(paid.paidAmount.toNumber(), 25000);
  assert.equal(paid.status, "PARTIALLY_PAID");
  assert.equal(await prisma.paymentAllocation.count({ where: { invoiceId: invoice.id } }), 1);
});

test("staff invitation stores the selected role key in the migrated database column", async () => {
  const fixture = await createSchoolFixture("invitation");
  const invitationId = `integration-${runId}`;
  const tokenHash = `token-${runId}`;
  await prisma.$executeRaw`
    INSERT INTO "Invitation" ("id", "schoolId", "email", "tokenHash", "status", "expiresAt", "invitedById", "createdAt", "updatedAt", "roleKey")
    VALUES (${invitationId}, ${fixture.school.id}, ${`staff-${runId}@example.test`}, ${tokenHash}, 'PENDING', ${new Date("2099-01-01T00:00:00.000Z")}, ${fixture.user.id}, NOW(), NOW(), 'finance')
  `;
  const rows = await prisma.$queryRaw<Array<{ roleKey: string; status: string }>>`
    SELECT "roleKey", "status"::text FROM "Invitation" WHERE "id" = ${invitationId}
  `;
  assert.deepEqual(rows, [{ roleKey: "finance", status: "PENDING" }]);
});
