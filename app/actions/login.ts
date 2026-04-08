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
  let college_account_kind: "FORMATION" | "FOLLOWUP" | "DEPARTMENT" | undefined;
  let college_subject_id: string | undefined;

  try {
    if (user.role === "COLLEGE") {
      const profile = await getCollegeProfileByUserId(uid);
      college_account_kind =
        profile?.account_kind === "FOLLOWUP"
          ? "FOLLOWUP"
          : profile?.account_kind === "DEPARTMENT"
            ? "DEPARTMENT"
            : "FORMATION";
      college_subject_id =
        profile?.account_kind === "DEPARTMENT" && profile.college_subject_id
          ? profile.college_subject_id
          : undefined;
      await createSession({
        uid,
        username: user.username,
        role: user.role,
        college_account_kind,
        college_subject_id,
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
    if (college_account_kind === "DEPARTMENT") {
      redirect("/department");
    }
    redirect("/dashboard/college");
  }

  redirect("/dashboard");
}
