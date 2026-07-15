import { redirect } from "next/navigation";

import { auth } from "@/auth";

export default async function AfterLoginPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.platformRole) redirect("/platform");
  if (session.user.guardianId) redirect("/guardian");
  if (session.user.schoolId) redirect("/school");
  redirect("/login?error=no-access");
}