# My Sekolah V1 Release Checklist

## Release gates

A release may be tagged `v1.0.0` only when every blocking item below is complete.

### Data and migrations

- [ ] A brand-new PostgreSQL database can be created from repository migrations with `prisma migrate deploy`.
- [ ] `prisma/schema.prisma` contains every production table and column, including guardian portal models and `Invitation.roleKey`.
- [ ] Migration history has no dependency-order failures.
- [ ] A backup has been created and a restore has been tested on a separate database.

### Production safety

- [x] Production builds do not run seed scripts.
- [x] Production builds do not reset the platform-owner password.
- [x] Production builds run migration deployment, security-policy tests, TypeScript checks through Next.js build, and optimized compilation.
- [ ] Required environment variables are documented and validated.
- [ ] Runtime errors are reviewed before release.

### Security and access

- [x] School subscription and suspension access is enforced during login.
- [x] Tenant-isolation policies have unit coverage.
- [ ] Every school action scopes reads and writes by `schoolId`.
- [ ] Active staff roles can be changed safely without removing the last owner.
- [ ] Password recovery is available for staff and guardians.
- [ ] Invitation and activation endpoints have rate limiting.

### Critical journeys

- [ ] Create and configure a school.
- [ ] Invite and activate staff.
- [ ] Import, create, update, and transition students.
- [ ] Configure academic year, semester, grade, class, and homeroom teacher.
- [ ] Submit and correct attendance.
- [ ] Create invoices, record payments, print receipts, and export reports.
- [ ] Publish announcements.
- [ ] Invite a guardian, activate the account, and view only linked students.
- [ ] Suspend a school and confirm access is blocked.

### Operations

- [ ] Document incident owner and escalation contact.
- [ ] Document database backup and restore procedure.
- [ ] Document manual seed procedure for demo environments only.
- [ ] Document manual platform-owner password rotation.
- [ ] Review runtime errors for the previous seven days.
- [ ] Confirm production aliases point to the final deployment.

### Legal and release

- [ ] Publish privacy policy.
- [ ] Publish terms of service.
- [ ] Prepare release notes.
- [ ] Complete pilot acceptance with at least one representative school tenant.
- [ ] Create Git tag `v1.0.0` only after all blocking gates pass.

## Deployment runbook

1. Create and verify a database backup.
2. Review pending migrations in source control.
3. Deploy from `main`.
4. Confirm `prisma migrate deploy` succeeds.
5. Confirm security-policy tests pass.
6. Confirm Next.js compilation and TypeScript checks pass.
7. Verify `/login` loads and protected school, guardian, and platform routes reject anonymous access.
8. Verify school-owner, staff, guardian, and platform-owner login journeys.
9. Review Vercel runtime errors and logs.
10. Record deployment ID, commit SHA, and rollback candidate.

## Rollback

Application rollback uses the previous READY Vercel deployment. Database rollback must not be attempted by reversing SQL automatically. When a migration causes an incident, stop writes when necessary, restore from the verified backup or apply a reviewed forward-fix migration, then document the incident.