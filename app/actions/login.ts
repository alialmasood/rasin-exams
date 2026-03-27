"use server";

import { redirect } from "next/navigation";
import { isDatabaseConfigured } from "@/lib/db";
import { createSession } from "@/lib/session";
import { authenticatePortalUser } from "@/lib/users";

export async function loginAction(formData: FormData) {
  if (!isDatabaseConfigured()) {
    redirect("/?error=db");
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const user = await authenticatePortalUser(username, password);
  if (!user) {
    redirect("/?error=credentials");
  }

  try {
    await createSession({
      uid: user.id,
      username: user.username,
      role: user.role,
    });
  } catch {
    redirect("/?error=config");
  }

  if (user.role === "COLLEGE") {
    redirect("/dashboard/college");
  }
  redirect("/dashboard");
}
