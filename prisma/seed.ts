import {
  MembershipStatus,
  PlatformRole,
  PrismaClient,
  SchoolStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const permissionDefinitions = [
  ["school.read", "Melihat profil dan konfigurasi sekolah"],
  ["school.update", "Mengubah profil dan konfigurasi sekolah"],
  ["member.read", "Melihat pengguna sekolah"],
  ["member.invite", "Mengundang pengguna sekolah"],
  ["member.update", "Mengubah akses pengguna sekolah"],
  ["student.read", "Melihat data siswa"],
  ["student.create", "Menambahkan siswa"],
  ["student.update", "Mengubah data siswa"],
  ["student.archive", "Mengarsipkan siswa"],
  ["student.import", "Mengimpor data siswa"],
  ["student.export", "Mengekspor data siswa"],
  ["attendance.read", "Melihat absensi"],
  ["attendance.create", "Mengisi absensi"],
  ["attendance.update", "Mengoreksi absensi"],
  ["attendance.export", "Mengekspor rekap absensi"],
  ["invoice.read", "Melihat tagihan"],
  ["invoice.create", "Membuat tagihan"],
  ["invoice.update", "Mengubah tagihan"],
  ["invoice.cancel", "Membatalkan tagihan"],
  ["payment.read", "Melihat pembayaran"],
  ["payment.create", "Mencatat pembayaran"],
  ["payment.cancel", "Membatalkan atau membalik pembayaran"],
  ["report.read", "Melihat laporan"],
  ["report.export", "Mengekspor laporan"],
  ["announcement.read", "Melihat pengumuman"],
  ["announcement.create", "Membuat pengumuman"],
  ["announcement.publish", "Menerbitkan pengumuman"],
] as const;

const roleDefinitions = [
  {
    key: "school-owner",
    name: "School Owner",
    description: "Pemilik tenant sekolah dengan seluruh permission sekolah.",
    permissions: permissionDefinitions.map(([key]) => key),
  },
  {
    key: "school-admin",
    name: "School Admin",
    description: "Administrator operasional sekolah.",
    permissions: permissionDefinitions.map(([key]) => key),
  },
  {
    key: "principal",
    name: "Kepala Sekolah",
    description: "Akses monitoring akademik dan operasional.",
    permissions: [
      "school.read",
      "member.read",
      "student.read",
      "student.export",
      "attendance.read",
      "attendance.export",
      "invoice.read",
      "payment.read",
      "report.read",
      "report.export",
      "announcement.read",
      "announcement.create",
      "announcement.publish",
    ],
  },
  {
    key: "finance",
    name: "Bendahara",
    description: "Mengelola tagihan, pembayaran, kuitansi, dan laporan keuangan.",
    permissions: [
      "student.read",
      "student.export",
      "invoice.read",
      "invoice.create",
      "invoice.update",
      "invoice.cancel",
      "payment.read",
      "payment.create",
      "payment.cancel",
      "report.read",
      "report.export",
      "announcement.read",
    ],
  },
  {
    key: "teacher",
    name: "Guru",
    description: "Mengakses siswa dan absensi kelas yang ditugaskan.",
    permissions: [
      "student.read",
      "attendance.read",
      "attendance.create",
      "announcement.read",
    ],
  },
  {
    key: "homeroom-teacher",
    name: "Wali Kelas",
    description: "Guru dengan akses koreksi dan rekap kelas yang diampu.",
    permissions: [
      "student.read",
      "attendance.read",
      "attendance.create",
      "attendance.update",
      "attendance.export",
      "announcement.read",
      "announcement.create",
    ],
  },
  {
    key: "guardian",
    name: "Orang Tua/Wali",
    description: "Akses terbatas ke anak yang memiliki hubungan wali.",
    permissions: [
      "student.read",
      "attendance.read",
      "invoice.read",
      "payment.read",
      "announcement.read",
    ],
  },
] as const;

async function seedSchoolAccess(schoolId: string) {
  const permissionIds = new Map<string, string>();

  for (const [key, description] of permissionDefinitions) {
    const permission = await prisma.permission.upsert({
      where: { schoolId_key: { schoolId, key } },
      update: { description },
      create: { schoolId, key, description },
      select: { id: true },
    });

    permissionIds.set(key, permission.id);
  }

  const roleIds = new Map<string, string>();

  for (const definition of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { schoolId_key: { schoolId, key: definition.key } },
      update: {
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
      create: {
        schoolId,
        key: definition.key,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
      select: { id: true },
    });

    roleIds.set(definition.key, role.id);

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: definition.permissions.map((permissionKey) => ({
        roleId: role.id,
        permissionId: permissionIds.get(permissionKey)!,
      })),
      skipDuplicates: true,
    });
  }

  return roleIds;
}

async function main() {
  const ownerEmail = process.env.SEED_PLATFORM_OWNER_EMAIL?.trim().toLowerCase();

  if (!ownerEmail) {
    throw new Error("SEED_PLATFORM_OWNER_EMAIL wajib diisi sebelum menjalankan seed.");
  }

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: { name: process.env.SEED_PLATFORM_OWNER_NAME ?? "Platform Owner" },
    create: {
      email: ownerEmail,
      name: process.env.SEED_PLATFORM_OWNER_NAME ?? "Platform Owner",
      emailVerified: new Date(),
    },
  });

  await prisma.platformMembership.upsert({
    where: { userId: owner.id },
    update: { role: PlatformRole.OWNER, isActive: true },
    create: { userId: owner.id, role: PlatformRole.OWNER },
  });

  const demoSchool = await prisma.school.upsert({
    where: { code: "DEMO-001" },
    update: {},
    create: {
      code: "DEMO-001",
      slug: "sekolah-demo",
      name: "Sekolah Demo Nusantara",
      email: ownerEmail,
      status: SchoolStatus.TRIAL,
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      settings: { create: {} },
    },
  });

  const roleIds = await seedSchoolAccess(demoSchool.id);

  const membership = await prisma.schoolMember.upsert({
    where: {
      schoolId_userId: { schoolId: demoSchool.id, userId: owner.id },
    },
    update: { status: MembershipStatus.ACTIVE, joinedAt: new Date() },
    create: {
      schoolId: demoSchool.id,
      userId: owner.id,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date(),
    },
  });

  await prisma.memberRole.upsert({
    where: {
      memberId_roleId: {
        memberId: membership.id,
        roleId: roleIds.get("school-owner")!,
      },
    },
    update: {},
    create: {
      memberId: membership.id,
      roleId: roleIds.get("school-owner")!,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: owner.id,
      schoolId: demoSchool.id,
      action: "database.seeded",
      entityType: "School",
      entityId: demoSchool.id,
      metadata: { source: "prisma/seed.ts" },
    },
  });

  console.info(`Seed selesai untuk ${ownerEmail} dan tenant ${demoSchool.slug}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
