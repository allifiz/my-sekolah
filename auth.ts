import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(8).max(128) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [Credentials({
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    async authorize(rawCredentials) {
      const parsed = credentialsSchema.safeParse(rawCredentials);
      if (!parsed.success) return null;
      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email },
        include: { platformMembership: true, schoolMemberships: { where: { status: "ACTIVE", deletedAt: null, school: { deletedAt: null } }, orderBy: { createdAt: "asc" }, take: 1, include: { school: { select: { id: true, status: true } } } } },
      });
      if (!user?.passwordHash || user.deletedAt) return null;
      const guardianRows = await prisma.$queryRaw<Array<{ guardianId: string; schoolId: string; schoolStatus: string }>>`SELECT ga."guardianId",ga."schoolId",s."status"::text AS "schoolStatus" FROM "GuardianAccount" ga JOIN "School" s ON s."id"=ga."schoolId" WHERE ga."userId"=${user.id} LIMIT 1`;
      const guardian = guardianRows[0];
      const platformAccess = Boolean(user.platformMembership?.isActive);
      const schoolMembership = user.schoolMemberships[0];
      const schoolAccess = Boolean(schoolMembership && !["SUSPENDED", "CANCELLED", "ARCHIVED"].includes(schoolMembership.school.status));
      const guardianAccess = Boolean(guardian && !["SUSPENDED", "CANCELLED", "ARCHIVED"].includes(guardian.schoolStatus));
      if (!platformAccess && !schoolAccess && !guardianAccess) return null;
      if (!(await compare(parsed.data.password, user.passwordHash))) return null;
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return { id: user.id, email: user.email, name: user.name, platformRole: user.platformMembership?.role, schoolId: schoolMembership?.schoolId ?? guardian?.schoolId, guardianId: guardian?.guardianId };
    },
  })],
  callbacks: {
    jwt({ token, user }) { if (user) { token.userId = user.id; token.platformRole = user.platformRole; token.schoolId = user.schoolId; token.guardianId = user.guardianId; } return token; },
    session({ session, token }) { if (session.user) { session.user.id = token.userId as string; session.user.platformRole = token.platformRole as string | undefined; session.user.schoolId = token.schoolId as string | undefined; session.user.guardianId = token.guardianId as string | undefined; } return session; },
  },
});