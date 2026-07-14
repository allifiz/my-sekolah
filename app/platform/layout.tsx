import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  if (!session?.user) redirect("/login");
  if (!session.user.platformRole) redirect("/");

  return <>{children}</>;
}