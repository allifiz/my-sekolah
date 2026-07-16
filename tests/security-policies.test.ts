import assert from "node:assert/strict";
import test from "node:test";

import {
  attendanceClassAllowed,
  belongsToTenant,
  canChangeMemberStatus,
  canInviteStaff,
  guardianOwnsStudent,
  hasAnyRole,
  hasSchoolAccess,
  nextInvoicePaymentState,
  paymentAmountAllowed,
} from "../lib/security/policies";

const now = new Date("2026-07-16T00:00:00.000Z");

test("school access blocks suspended, cancelled, and archived tenants", () => {
  for (const status of ["SUSPENDED", "CANCELLED", "ARCHIVED"]) {
    assert.equal(hasSchoolAccess({ status }, now), false);
  }
});

test("school access enforces trial and subscription expiry", () => {
  assert.equal(hasSchoolAccess({ status: "TRIAL", trialEndsAt: new Date("2026-07-15T23:59:59.000Z") }, now), false);
  assert.equal(hasSchoolAccess({ status: "TRIAL", trialEndsAt: new Date("2026-07-17T00:00:00.000Z") }, now), true);
  assert.equal(hasSchoolAccess({ status: "ACTIVE", subscriptionEndsAt: new Date("2026-07-15T23:59:59.000Z") }, now), false);
  assert.equal(hasSchoolAccess({ status: "PAST_DUE", subscriptionEndsAt: new Date("2026-07-17T00:00:00.000Z") }, now), true);
});

test("tenant isolation requires exact school id equality", () => {
  assert.equal(belongsToTenant("school-a", "school-a"), true);
  assert.equal(belongsToTenant("school-a", "school-b"), false);
  assert.equal(belongsToTenant(undefined, "school-a"), false);
});

test("guardian can only select linked students", () => {
  assert.equal(guardianOwnsStudent(["student-a", "student-b"], "student-b"), true);
  assert.equal(guardianOwnsStudent(["student-a", "student-b"], "student-c"), false);
});

test("role boundary accepts only explicitly allowed roles", () => {
  assert.equal(hasAnyRole(["teacher"], ["school-owner", "school-admin"]), false);
  assert.equal(hasAnyRole(["teacher", "school-admin"], ["school-owner", "school-admin"]), true);
});

test("staff invitation respects duplicates and package limit", () => {
  assert.equal(canInviteStaff({ activeMembers: 4, pendingInvitations: 0, userLimit: 5, duplicatePendingInvitation: false, existingActiveMember: false }), true);
  assert.equal(canInviteStaff({ activeMembers: 4, pendingInvitations: 1, userLimit: 5, duplicatePendingInvitation: false, existingActiveMember: false }), false);
  assert.equal(canInviteStaff({ activeMembers: 1, pendingInvitations: 0, userLimit: 5, duplicatePendingInvitation: true, existingActiveMember: false }), false);
  assert.equal(canInviteStaff({ activeMembers: 1, pendingInvitations: 0, userLimit: 5, duplicatePendingInvitation: false, existingActiveMember: true }), false);
});

test("last active school owner cannot be disabled", () => {
  assert.equal(canChangeMemberStatus({ targetIsActiveOwner: true, activeOwnerCount: 1, nextStatus: "SUSPENDED" }), false);
  assert.equal(canChangeMemberStatus({ targetIsActiveOwner: true, activeOwnerCount: 2, nextStatus: "SUSPENDED" }), true);
  assert.equal(canChangeMemberStatus({ targetIsActiveOwner: false, activeOwnerCount: 1, nextStatus: "SUSPENDED" }), true);
});

test("homeroom attendance access is limited to assigned classes unless manager", () => {
  assert.equal(attendanceClassAllowed({ isManager: false, assignedClassGroupIds: ["class-a"], requestedClassGroupId: "class-a" }), true);
  assert.equal(attendanceClassAllowed({ isManager: false, assignedClassGroupIds: ["class-a"], requestedClassGroupId: "class-b" }), false);
  assert.equal(attendanceClassAllowed({ isManager: true, assignedClassGroupIds: [], requestedClassGroupId: "class-b" }), true);
});

test("payment cannot exceed outstanding balance or be non-positive", () => {
  assert.equal(paymentAmountAllowed(500_000, 500_000), true);
  assert.equal(paymentAmountAllowed(500_001, 500_000), false);
  assert.equal(paymentAmountAllowed(0, 500_000), false);
  assert.equal(paymentAmountAllowed(-1, 500_000), false);
});

test("invoice status follows paid amount", () => {
  assert.deepEqual(nextInvoicePaymentState(500_000, 0), { paidAmount: 0, status: "ISSUED" });
  assert.deepEqual(nextInvoicePaymentState(500_000, 200_000), { paidAmount: 200_000, status: "PARTIALLY_PAID" });
  assert.deepEqual(nextInvoicePaymentState(500_000, 500_000), { paidAmount: 500_000, status: "PAID" });
  assert.deepEqual(nextInvoicePaymentState(500_000, 700_000), { paidAmount: 500_000, status: "PAID" });
});
