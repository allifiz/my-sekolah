"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";

export async function loginAction(formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/after-login",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=invalid-credentials");
    }
    throw error;
  }
}
