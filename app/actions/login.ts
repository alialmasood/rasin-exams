"use server";

import { redirect } from "next/navigation";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
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

  const uid = String(user.id);

  /** يُحدَّد لـ COLLEGE فقط — لاستخدامه بعد إنشاء الجلسة (خارج try حتى لا يلتقط redirect خطأ NEXT_REDIRECT). */
  let college_account_kind: "FORMATION" | "FOLLOWUP" | undefined;

  try {
    if (user.role === "COLLEGE") {
      const profile = await getCollegeProfileByUserId(uid);
      college_account_kind = profile?.account_kind === "FOLLOWUP" ? "FOLLOWUP" : "FORMATION";
      await createSession({
        uid,
        username: user.username,
        role: user.role,
        college_account_kind,
      });
    } else {
      await createSession({
        uid,
        username: user.username,
        role: user.role,
      });
    }
  } catch {
    redirect("/?error=config");
  }

  if (user.role === "COLLEGE") {
    if (college_account_kind === "FOLLOWUP") {
      redirect("/tracking");
    }
    redirect("/dashboard/college");
  }

  redirect("/dashboard");
}
