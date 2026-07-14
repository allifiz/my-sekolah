import "next-auth";

interface PlatformUserFields {
  platformRole?: string;
}

declare module "next-auth" {
  interface User extends PlatformUserFields {}
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
    } & PlatformUserFields;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends PlatformUserFields {
    userId?: string;
  }
}