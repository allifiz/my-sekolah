import { AuthorizationError, requireSchoolAccess } from "@/lib/auth/authorization";

export type TenantContext = {
  userId: string;
  schoolId: string;
};

export async function createTenantContext(
  userId: string | null | undefined,
  schoolId: string | null | undefined,
): Promise<TenantContext> {
  if (!userId) {
    throw new AuthorizationError("Authentication is required.");
  }

  if (!schoolId) {
    throw new AuthorizationError("A school context is required.");
  }

  await requireSchoolAccess(userId, schoolId);

  return { userId, schoolId };
}

export function tenantWhere<T extends Record<string, unknown>>(
  context: TenantContext,
  where?: T,
): T & { schoolId: string } {
  return {
    ...where,
    schoolId: context.schoolId,
  };
}
