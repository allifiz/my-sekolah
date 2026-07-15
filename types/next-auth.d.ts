import "next-auth";

interface AppUserFields {
  platformRole?: string;
  schoolId?: string;
  guardianId?: string;
}

declare module "next-auth" {
  interface User extends AppUserFields {}
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
    } & AppUserFields;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends AppUserFields {
    userId?: string;
  }
}