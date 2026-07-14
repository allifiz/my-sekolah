import { MembershipStatus, PlatformRole, SchoolStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const accessibleSchoolStatuses: SchoolStatus[] = [
  SchoolStatus.TRIAL,
  SchoolStatus.ACTIVE,
  SchoolStatus.PAST_DUE,
];

export class AuthorizationError extends Error {
  constructor(message = "You are not authorized to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function getPlatformAccess(userId: string) {
  return prisma.platformMembership.findFirst({
    where: {
      userId,
      isActive: true,
      user: { deletedAt: null },
    },
  });
}

export async function requirePlatformRole(
  userId: string,
  allowedRoles: readonly PlatformRole[],
) {
  const membership = await getPlatformAccess(userId);

  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new AuthorizationError();
  }

  return membership;
}

export async function getSchoolAccess(userId: string, schoolId: string) {
  return prisma.schoolMember.findFirst({
    where: {
      userId,
      schoolId,
      status: MembershipStatus.ACTIVE,
      deletedAt: null,
      user: { deletedAt: null },
      school: {
        deletedAt: null,
        status: { in: accessibleSchoolStatuses },
      },
    },
    include: {
      school: true,
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });
}

export async function requireSchoolAccess(userId: string, schoolId: string) {
  const membership = await getSchoolAccess(userId, schoolId);

  if (!membership) {
    throw new AuthorizationError("School access is not available.");
  }

  return membership;
}

export async function requireSchoolPermission(
  userId: string,
  schoolId: string,
  permissionKey: string,
) {
  const membership = await requireSchoolAccess(userId, schoolId);
  const permissionKeys = new Set(
    membership.roles.flatMap(({ role }) =>
      role.permissions.map(({ permission }) => permission.key),
    ),
  );

  if (!permissionKeys.has(permissionKey)) {
    throw new AuthorizationError(
      `Missing required permission: ${permissionKey}`,
    );
  }

  return membership;
}
