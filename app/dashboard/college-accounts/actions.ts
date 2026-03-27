"use server";

import { revalidatePath } from "next/cache";
import { createCollegeAccount } from "@/lib/college-accounts";
import type { UserRole } from "@/lib/authz";
import { isAdminRole } from "@/lib/authz";
import { getSession } from "@/lib/session";
import { isRasinDbMigrationRequiredError } from "@/lib/schema-errors";

export type CreateCollegeAccountState = { ok: true } | { ok: false; message: string } | null;

export async function createCollegeAccountAction(
  _prev: CreateCollegeAccountState,
  formData: FormData
): Promise<CreateCollegeAccountState> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false, message: "غير مصرح لك بإنشاء حساب كلية." };
  }

  const kindRaw = String(formData.get("account_kind") ?? "").trim().toUpperCase();
  const accountKind = kindRaw === "FOLLOWUP" ? "FOLLOWUP" : kindRaw === "FORMATION" ? "FORMATION" : null;
  if (!accountKind) {
    return { ok: false, message: "يرجى اختيار نوع الحساب (تشكيل أو متابعة)." };
  }

  let result: Awaited<ReturnType<typeof createCollegeAccount>>;
  try {
    result = await createCollegeAccount({
      accountKind,
      formationName: String(formData.get("formation") ?? ""),
      deanName: String(formData.get("dean_name") ?? ""),
      holderName: String(formData.get("holder_name") ?? ""),
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirmPassword: String(formData.get("confirm_password") ?? ""),
      createdByUserId: session.uid,
    });
  } catch (err: unknown) {
    if (isRasinDbMigrationRequiredError(err)) {
      return { ok: false, message: err.message };
    }
    console.error("[createCollegeAccountAction]", err);
    return { ok: false, message: "تعذر إنشاء الحساب حاليًا. حاول مرة أخرى." };
  }

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath("/dashboard/college-accounts");
  return { ok: true };
}
