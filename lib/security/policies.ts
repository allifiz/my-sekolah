export type SchoolAccessInput = {
  status: string;
  trialEndsAt?: Date | null;
  subscriptionEndsAt?: Date | null;
};

const blockedStatuses = new Set(["SUSPENDED", "CANCELLED", "ARCHIVED"]);

export function hasSchoolAccess(school: SchoolAccessInput, now = new Date()) {
  if (blockedStatuses.has(school.status)) return false;
  if (school.status === "TRIAL" && school.trialEndsAt && school.trialEndsAt <= now) return false;
  if (["ACTIVE", "PAST_DUE"].includes(school.status) && school.subscriptionEndsAt && school.subscriptionEndsAt <= now) return false;
  return true;
}

export function belongsToTenant(resourceSchoolId: string | null | undefined, sessionSchoolId: string | null | undefined) {
  return Boolean(resourceSchoolId && sessionSchoolId && resourceSchoolId === sessionSchoolId);
}

export function guardianOwnsStudent(ownedStudentIds: readonly string[], requestedStudentId: string | null | undefined) {
  return Boolean(requestedStudentId && ownedStudentIds.includes(requestedStudentId));
}

export function hasAnyRole(memberRoleKeys: readonly string[], allowedRoleKeys: readonly string[]) {
  return memberRoleKeys.some((role) => allowedRoleKeys.includes(role));
}

export function canInviteStaff(input: {
  activeMembers: number;
  pendingInvitations: number;
  userLimit: number;
  duplicatePendingInvitation: boolean;
  existingActiveMember: boolean;
}) {
  if (input.duplicatePendingInvitation || input.existingActiveMember) return false;
  return input.activeMembers + input.pendingInvitations < input.userLimit;
}

export function canChangeMemberStatus(input: {
  targetIsActiveOwner: boolean;
  activeOwnerCount: number;
  nextStatus: string;
}) {
  const disabling = input.nextStatus !== "ACTIVE";
  if (disabling && input.targetIsActiveOwner && input.activeOwnerCount <= 1) return false;
  return true;
}

export function attendanceClassAllowed(input: {
  isManager: boolean;
  assignedClassGroupIds: readonly string[];
  requestedClassGroupId: string;
}) {
  return input.isManager || input.assignedClassGroupIds.includes(input.requestedClassGroupId);
}

export function paymentAmountAllowed(amount: number, outstanding: number) {
  return Number.isFinite(amount) && Number.isFinite(outstanding) && amount > 0 && outstanding > 0 && amount <= outstanding;
}

export function nextInvoicePaymentState(totalAmount: number, paidAmount: number) {
  if (paidAmount <= 0) return { paidAmount: 0, status: "ISSUED" as const };
  if (paidAmount >= totalAmount) return { paidAmount: totalAmount, status: "PAID" as const };
  return { paidAmount, status: "PARTIALLY_PAID" as const };
}
