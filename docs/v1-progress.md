# V1 Release Progress

_Last updated: 16 July 2026_

This document is the execution checklist for V1 and must stay aligned with `docs/product-v1.md`.

## Overall status

- Estimated V1 completion: **84%**
- Current phase: **Core product and operational visibility complete; automated coverage and production hardening remain**
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
- [x] School profile and operational settings
- [x] Receipt prefix, locale, and timezone settings
- [x] Login enforcement for suspended, cancelled, and archived schools
- [x] Trial and subscription expiry enforcement for staff and guardians
- [x] User-limit enforcement during staff invitation and activation
- [x] Platform tenant-health dashboard with status, expiry, capacity, and activity risk indicators

### Remaining
- [ ] Platform admin subscription and limit management UI
- [ ] Platform-wide audit log viewer
- [ ] Impersonation UI, expiry handling, and visible impersonation banner
- [ ] Grace-period policy and renewal workflow for past-due subscriptions

## 2. Roles, members, and permissions

### Done
- [x] School member model
- [x] Role and permission models
- [x] System roles and permission assignments
- [x] Staff invitation for admin, principal, finance, teacher, and homeroom teacher
- [x] Role-aware staff invitation activation
- [x] Member list and invitation history
- [x] Suspend, reactivate, and remove staff access
- [x] Prevent disabling the last active School Owner
- [x] Revoke pending staff invitations
- [x] Member access audit trail

### Remaining
- [ ] Create and edit custom roles
- [ ] Permission matrix UI
- [ ] Change role for an existing member
- [ ] Resend expired staff invitations
- [ ] Automated role-boundary coverage
- [ ] Consistent permission helper replacing remaining repeated role-key checks

## 3. Academic structure

### Done
- [x] Academic years and semesters
- [x] Grade levels and class groups
- [x] Capacity and active-state management
- [x] Homeroom assignment and history
- [x] Academic audit trail

### Remaining
- [ ] Edit academic entities
- [ ] Safe archive rules
- [ ] Academic rollover and bulk promotion
- [ ] Class roster detail page

## 4. Students, guardians, and enrollment

### Done
- [x] Student and guardian models
- [x] Student–guardian relationships and primary guardian
- [x] Enrollment and class transfers
- [x] Student lifecycle and audit trail
- [x] Capacity and package-limit enforcement
- [x] CSV import/export compatible with Excel

### Remaining
- [ ] Edit guardian data and relationships
- [ ] Student and guardian detail pages
- [ ] Bulk guardian import
- [ ] Bulk promotion and graduation
- [ ] Separate immutable enrollment record for every class transfer

## 5. Attendance

### Done
- [x] Attendance session and record models
- [x] Present, sick, excused, absent, and late statuses
- [x] Daily attendance by class group
- [x] Homeroom access boundaries
- [x] Bulk present with exceptions
- [x] Corrections with reason and audit trail
- [x] Daily/monthly recap, student history, statistics, and CSV export

### Remaining
- [ ] Cross-month student history
- [ ] Alerts and anomaly indicators
- [ ] Automated attendance tests

## 6. Finance

### Done
- [x] Fee categories, invoices, and invoice items
- [x] Payments, allocations, balances, and receipts
- [x] Bulk invoices per class group
- [x] Finance dashboard, reports, and CSV export
- [x] Invoice cancellation and payment reversal with audit trail

### Remaining
- [ ] Discounts and invoice adjustments
- [ ] Allocate one payment to multiple invoices
- [ ] Formal receipt print styling
- [ ] Concurrent payment tests

## 7. Communication

### Done
- [x] Announcement model and readership tracking
- [x] School-wide and class-targeted announcements
- [x] Draft, scheduled publish, expiry, and unpublish lifecycle
- [x] Staff announcement feed and audit trail

### Remaining
- [ ] Announcement email delivery
- [ ] Global unread badge
- [ ] Edit existing announcement content
- [ ] Automated scheduling and visibility tests

## 8. Parent portal

### Done
- [x] Guardian invitation and activation
- [x] Guardian login routing and isolated session identity
- [x] Authenticated guardian-to-record linkage
- [x] Child switcher with server-side ownership validation
- [x] Student profile and active-class summary
- [x] Attendance summary and history
- [x] Billing, balance, payment, and receipt summary
- [x] School and class announcement feed
- [x] Tenant-safe guardian authorization

### Remaining
- [ ] Resend and revoke guardian invitations
- [ ] Guardian password reset
- [ ] Guardian announcement read tracking
- [ ] Guardian receipt detail page
- [ ] Automated cross-guardian and cross-tenant tests

## 9. Reports and operational visibility

### Done
- [x] Student, attendance, and finance reports/exports
- [x] Announcement readership counts
- [x] School-wide KPI dashboard with students, members, attendance, announcements, billing, and tenant limits
- [x] School audit-log screen with action filtering and actor visibility
- [x] Platform dashboard KPIs
- [x] Subscription and tenant-health reporting
- [x] Tenant prioritization by status, expiry, capacity, and inactivity risk

### Remaining
- [ ] Platform-wide audit log viewer
- [ ] Drill-down charts and historical trends
- [ ] Export operational KPI snapshots

## 10. Release readiness

### Done
- [x] Production migrations execute during Vercel builds
- [x] Production aliases are configured
- [x] Core application modules deploy successfully

### Remaining
- [ ] Unit tests
- [ ] Tenant-isolation integration tests
- [ ] Critical-journey end-to-end tests
- [ ] Role-boundary and subscription-expiry tests
- [ ] Import and concurrent-write tests
- [ ] Error monitoring and alerting
- [ ] Database backup and restore runbook
- [ ] Privacy policy and terms
- [ ] Security review checklist
- [ ] Demo/pilot school
- [ ] Pilot execution and blocker fixes
- [ ] Scope freeze, release notes, and V1 tag
- [ ] Start branch-based workflow after V1 release

## Recommended execution order

1. **Automated coverage** — tenant isolation, roles, critical journeys, and concurrency.
2. **Production hardening** — monitoring, backups, legal pages, and security review.
3. **Core refinements** — guardian management, academic editing, and finance adjustments.
4. **Pilot and release** — demo tenant, real-school pilot, fixes, scope freeze, and V1 tag.

## V1 release gate

- [ ] One school can complete onboarding without manual database changes.
- [x] School staff can manage academic structure, students, guardians, and class assignments.
- [x] Teachers can submit and correct attendance.
- [x] Finance staff can issue bills, record payments, and generate receipts.
- [x] School staff can publish announcements.
- [x] Guardians can securely view their own children’s information.
- [ ] Tenant isolation and major role boundaries have automated coverage.
- [ ] Production monitoring and backup procedures are active.
- [ ] A pilot school has completed critical journeys without release-blocking defects.
