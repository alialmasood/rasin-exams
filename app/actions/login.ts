"use server";

import { redirect } from "next/navigation";
import { isDatabaseConfigured } from "@/lib/db";
import { createSession } from "@/lib/session";
import { authenticateSystemAdmin } from "@/lib/users";

export async function loginAction(formData: FormData) {
  if (!isDatabaseConfigured()) {
    redirect("/?error=db");
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const user = await authenticateSystemAdmin(username, password);
  if (!user) {
    redirect("/?error=credentials");
  }

  try {
    await createSession({
      uid: user.id,
      username: user.username,
      role: "ADMIN",
    });
  } catch {
    redirect("/?error=config");
  }

  redirect("/dashboard");
}
