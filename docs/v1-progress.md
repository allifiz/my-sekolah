# V1 Release Progress

_Last updated: 16 July 2026_

This document is the execution checklist for V1 and must stay aligned with `docs/product-v1.md`.

## Overall status

- Estimated V1 completion: **62%**
- Current phase: **Student, attendance, finance, and communication cores complete; Parent portal is next**
- Delivery mode during V1: **commit directly to `main`**
- Production status: **latest deployment pending verification on Vercel**

## 1. Platform and tenant foundation

### Done
- [x] Authentication and protected application areas
- [x] Platform admin and school workspace separation
- [x] School onboarding
- [x] School status, trial, subscription end date, student limit, and user limit fields
- [x] Tenant-scoped data access in implemented modules
- [x] School owner invitation email flow
- [x] Audit log foundation
- [x] Support impersonation data foundation
- [x] Production deployment through Vercel

### Remaining
- [ ] Complete school profile/settings management
- [ ] Complete subscription lifecycle enforcement
- [ ] Enforce user limits on invitation/member creation
- [ ] Enforce suspended, cancelled, and archived school access consistently
- [ ] Platform admin subscription and limit management UI
- [ ] Platform-wide audit log viewer
- [ ] Impersonation UI, expiry handling, and visible impersonation banner

## 2. Roles, members, and permissions

### Done
- [x] School member model
- [x] Role and permission models
- [x] Member-role relations
- [x] Owner, admin, and principal checks on implemented management actions
- [x] Invitation foundation and owner invitation delivery

### Remaining
- [ ] Full member management page
- [ ] Invite additional school staff
- [ ] Accept invitation flow for all staff roles
- [ ] Create and edit custom roles
- [ ] Permission matrix UI
- [ ] Teacher-specific permissions
- [ ] Finance-specific permissions
- [ ] Parent/guardian access permissions
- [ ] Consistent permission helper replacing repeated role-key checks

## 3. Academic structure

### Done
- [x] Academic years
- [x] Semesters
- [x] Grade levels
- [x] Class groups/rombel
- [x] Capacity per class group
- [x] Activate/deactivate grade levels and class groups
- [x] Homeroom teacher assignment
- [x] Homeroom assignment history
- [x] Audit trail for academic structure changes

### Remaining
- [ ] Edit academic year, semester, grade level, and class group
- [ ] Safe deletion/archive rules for unused academic records
- [ ] Prevent invalid activation combinations
- [ ] Academic rollover/promotion workflow
- [ ] Class roster detail page

## 4. Students, guardians, and enrollment

### Done
- [x] Student model and status lifecycle
- [x] Guardian model
- [x] Many-to-many student–guardian relations
- [x] Primary guardian support
- [x] Enrollment model
- [x] Enrollment to academic year and class group
- [x] Student limit enforcement
- [x] Class capacity enforcement
- [x] Create students and guardians
- [x] Link guardians to students
- [x] Enroll students into class groups
- [x] Edit student identity
- [x] Change student status
- [x] End active enrollment
- [x] Move students between class groups
- [x] Audit trail for student lifecycle changes
- [x] CSV template compatible with Excel
- [x] CSV preview and row validation
- [x] Transactional student import
- [x] Student export compatible with Excel
- [x] Production deployment verified READY

### Remaining
- [ ] Edit guardian data
- [ ] Unlink or change student–guardian relationships
- [ ] Change primary guardian
- [ ] Student detail page with full history
- [ ] Guardian detail page
- [ ] Native `.xlsx` import/export after V1 if still needed
- [ ] Bulk guardian import
- [ ] Promotion and graduation in bulk
- [ ] Improve enrollment history to use a separate record for every class transfer

## 5. Attendance

### Done
- [x] Attendance session model
- [x] Attendance record model
- [x] Statuses: present, sick, excused, absent, late
- [x] Daily attendance by class group
- [x] Homeroom teacher access to assigned class groups
- [x] Bulk mark present with exceptions
- [x] Attendance correction with reason and audit log
- [x] Daily recap
- [x] Monthly recap
- [x] Student attendance history by month
- [x] Class attendance statistics
- [x] CSV export compatible with Excel

### Remaining
- [ ] School-wide attendance dashboard across all class groups
- [ ] Cross-month student attendance history
- [ ] Attendance alerts and anomaly indicators
- [ ] Automated tests for attendance permissions and corrections

## 6. Finance

### Done
- [x] Fee category model
- [x] Billing/invoice model
- [x] Invoice items
- [x] Payment recording
- [x] Payment allocation
- [x] Receipt numbering and printable receipt
- [x] Outstanding balance calculation
- [x] Student billing position and history
- [x] Finance dashboard
- [x] Bulk invoice per class group
- [x] Finance reports and CSV export
- [x] Invoice cancellation with reason
- [x] Payment reversal with balance restoration
- [x] Audit trail for financial changes

### Remaining
- [ ] Discounts and invoice adjustments
- [ ] Allocate one payment to multiple invoices
- [ ] Formal print styling for receipts
- [ ] Concurrent payment transaction tests
- [ ] Automated tenant and finance-role tests

## 7. Communication

### Done
- [x] Email delivery foundation using Resend
- [x] Announcement data model and read tracking
- [x] School-wide announcements
- [x] Class-targeted announcements
- [x] Draft, publish, and unpublish lifecycle
- [x] Scheduled publication and expiry
- [x] Announcement read visibility
- [x] Staff announcement feed
- [x] Communication audit trail

### Remaining
- [ ] Email delivery for newly published announcements
- [ ] Push/in-app notification badge outside the feed
- [ ] Edit existing announcement content
- [ ] Automated visibility and scheduling tests

## 8. Parent portal

### Done
- [ ] Nothing implemented yet

### Remaining
- [ ] Guardian account invitation/activation
- [ ] Guardian login routing
- [ ] Link authenticated guardian user to guardian records
- [ ] Child switcher for guardians with multiple children
- [ ] Student profile summary
- [ ] Attendance summary
- [ ] Billing and payment summary
- [ ] Announcement feed
- [ ] Tenant-safe parent portal authorization

## 9. Reports and operational visibility

### Done
- [x] Basic dashboard foundations
- [x] Student CSV export
- [x] Attendance daily and monthly reports
- [x] Attendance CSV export
- [x] Finance reports and CSV export
- [x] Announcement readership counts

### Remaining
- [ ] Platform dashboard KPIs
- [ ] School dashboard KPIs
- [ ] Audit log screens
- [ ] Student roster reports
- [ ] Subscription and tenant health reporting

## 10. Release readiness

### Done
- [x] Production database migrations execute in Vercel build
- [x] Production aliases are configured
- [x] Main application deploys successfully

### Remaining
- [ ] Add automated unit tests
- [ ] Add integration tests for tenant isolation
- [ ] Add end-to-end tests for critical user journeys
- [ ] Test all role boundaries
- [ ] Test school suspension and subscription expiry
- [ ] Test invitation expiry and replay prevention
- [ ] Test imports with malformed and large files
- [ ] Test concurrent class capacity and student-limit writes
- [ ] Add error monitoring and alerting
- [ ] Add database backup and restore runbook
- [ ] Add privacy policy and terms
- [ ] Add security review checklist
- [ ] Add seed/demo school for pilot
- [ ] Run pilot with at least one real school
- [ ] Fix pilot blockers
- [ ] Freeze V1 scope
- [ ] Create release notes
- [ ] Tag V1 release
- [ ] Start branch-based workflow after V1 release

## Recommended execution order

1. **Parent portal** — guardian identity, child switcher, attendance, billing, and announcements.
2. **Foundation completion** — members, permissions, subscription enforcement, and settings.
3. **Core refinements** — guardian management, academic editing, finance adjustments, and communication notifications.
4. **Operational visibility** — school/platform dashboards and audit-log screens.
5. **Hardening** — tests, security checks, monitoring, backups, pilot, and release.

## V1 release gate

V1 may be released only when all conditions below are true:

- [ ] One school can complete onboarding without manual database changes.
- [ ] School staff can manage academic structure, students, guardians, and class assignments.
- [x] Teachers can submit and correct attendance.
- [x] Finance staff can issue bills, record payments, and generate receipts.
- [x] School staff can publish announcements.
- [ ] Guardians can securely view their own children’s information.
- [ ] Tenant isolation and major role boundaries have automated coverage.
- [ ] Production monitoring and backup procedures are active.
- [ ] A pilot school has completed the critical journeys without release-blocking defects.
