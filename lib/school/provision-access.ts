import type { Prisma } from "@prisma/client";

const permissions = [
  "school.read", "school.update", "member.read", "member.invite", "member.update",
  "student.read", "student.create", "student.update", "student.archive", "student.import", "student.export",
  "attendance.read", "attendance.create", "attendance.update", "attendance.export",
  "invoice.read", "invoice.create", "invoice.update", "invoice.cancel",
  "payment.read", "payment.create", "payment.cancel", "report.read", "report.export",
  "announcement.read", "announcement.create", "announcement.publish",
] as const;

const roles = [
  { key: "school-owner", name: "School Owner", permissions: [...permissions] },
  { key: "school-admin", name: "School Admin", permissions: [...permissions] },
  { key: "principal", name: "Kepala Sekolah", permissions: ["school.read", "member.read", "student.read", "student.export", "attendance.read", "attendance.export", "invoice.read", "payment.read", "report.read", "report.export", "announcement.read", "announcement.create", "announcement.publish"] },
  { key: "finance", name: "Bendahara", permissions: ["student.read", "student.export", "invoice.read", "invoice.create", "invoice.update", "invoice.cancel", "payment.read", "payment.create", "payment.cancel", "report.read", "report.export", "announcement.read"] },
  { key: "teacher", name: "Guru", permissions: ["student.read", "attendance.read", "attendance.create", "announcement.read"] },
  { key: "homeroom-teacher", name: "Wali Kelas", permissions: ["student.read", "attendance.read", "attendance.create", "attendance.update", "attendance.export", "announcement.read", "announcement.create"] },
  { key: "guardian", name: "Orang Tua/Wali", permissions: ["student.read", "attendance.read", "invoice.read", "payment.read", "announcement.read"] },
] as const;

type TransactionClient = Prisma.TransactionClient;

export async function provisionSchoolAccess(tx: TransactionClient, schoolId: string) {
  const permissionIds = new Map<string, string>();
  for (const key of permissions) {
    const permission = await tx.permission.upsert({
      where: { schoolId_key: { schoolId, key } },
      update: {},
      create: { schoolId, key },
      select: { id: true },
    });
    permissionIds.set(key, permission.id);
  }

  const roleIds = new Map<string, string>();
  for (const definition of roles) {
    const role = await tx.role.upsert({
      where: { schoolId_key: { schoolId, key: definition.key } },
      update: { name: definition.name, isSystem: true },
      create: { schoolId, key: definition.key, name: definition.name, isSystem: true },
      select: { id: true },
    });
    roleIds.set(definition.key, role.id);
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    await tx.rolePermission.createMany({
      data: definition.permissions.map((key) => ({ roleId: role.id, permissionId: permissionIds.get(key)! })),
      skipDuplicates: true,
    });
  }

  return roleIds;
}
