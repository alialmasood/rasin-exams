"use server";

import { revalidatePath } from "next/cache";
import {
  createCollegeAccount,
  listCollegeSubjectsByFormationNameForAdmin,
  setCollegeAccountUserDisabled,
  deleteCollegeAccountPermanently,
  updateCollegeAccountUserPassword,
} from "@/lib/college-accounts";
import type { UserRole } from "@/lib/authz";
import { isAdminRole } from "@/lib/authz";
import { getSession } from "@/lib/session";
import { isRasinDbMigrationRequiredError } from "@/lib/schema-errors";

export type CreateCollegeAccountState = { ok: true } | { ok: false; message: string } | null;

export type CollegeAccountMutationState = { ok: true } | { ok: false; message: string } | null;

export type FormationSubjectOption = { id: string; branch_name: string; branch_type: "DEPARTMENT" | "BRANCH" };

/** لتحميل أقسام التشكيل في نموذج إنشاء حساب قسم (واجهة الإدارة فقط). */
export async function fetchFormationSubjectsForCollegeAccountAction(
  formationName: string
): Promise<FormationSubjectOption[]> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return [];
  }
  return listCollegeSubjectsByFormationNameForAdmin(formationName);
}

export async function createCollegeAccountAction(
  _prev: CreateCollegeAccountState,
  formData: FormData
): Promise<CreateCollegeAccountState> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false, message: "غير مصرح لك بإنشاء حساب كلية." };
  }

  const kindRaw = String(formData.get("account_kind") ?? "").trim().toUpperCase();
  const accountKind =
    kindRaw === "FOLLOWUP"
      ? "FOLLOWUP"
      : kindRaw === "FORMATION"
        ? "FORMATION"
        : kindRaw === "DEPARTMENT"
          ? "DEPARTMENT"
          : null;
  if (!accountKind) {
    return { ok: false, message: "يرجى اختيار نوع الحساب." };
  }

  let result: Awaited<ReturnType<typeof createCollegeAccount>>;
  try {
    result = await createCollegeAccount({
      accountKind,
      formationName: String(formData.get("formation") ?? ""),
      deanName: String(formData.get("dean_name") ?? ""),
      holderName: String(formData.get("holder_name") ?? ""),
      collegeSubjectId: String(formData.get("college_subject_id") ?? "").trim() || undefined,
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

export async function changeCollegeAccountPasswordAction(
  _prev: CollegeAccountMutationState,
  formData: FormData
): Promise<CollegeAccountMutationState> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false, message: "غير مصرح لك بتعديل حسابات الكلية." };
  }
  const profileId = String(formData.get("profile_id") ?? "").trim();
  const password = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  try {
    const result = await updateCollegeAccountUserPassword({
      profileId,
      password,
      confirmPassword,
      actorUserId: session.uid,
    });
    if (!result.ok) return { ok: false, message: result.message };
  } catch (err: unknown) {
    if (isRasinDbMigrationRequiredError(err)) {
      return { ok: false, message: err.message };
    }
    console.error("[changeCollegeAccountPasswordAction]", err);
    return { ok: false, message: "تعذر تحديث كلمة المرور." };
  }
  revalidatePath("/dashboard/college-accounts");
  return { ok: true };
}

export async function toggleCollegeAccountDisabledAction(profileId: string, disabled: boolean): Promise<CollegeAccountMutationState> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false, message: "غير مصرح لك." };
  }
  const id = profileId.trim();
  if (!/^[0-9]+$/.test(id)) {
    return { ok: false, message: "معرّف غير صالح." };
  }
  try {
    const result = await setCollegeAccountUserDisabled({
      profileId: id,
      disabled,
      actorUserId: session.uid,
    });
    if (!result.ok) return { ok: false, message: result.message };
  } catch (err: unknown) {
    if (isRasinDbMigrationRequiredError(err)) {
      return { ok: false, message: err.message };
    }
    console.error("[toggleCollegeAccountDisabledAction]", err);
    return { ok: false, message: "تعذر تحديث حالة الحساب." };
  }
  revalidatePath("/dashboard/college-accounts");
  return { ok: true };
}

export async function deleteCollegeAccountAction(profileId: string): Promise<CollegeAccountMutationState> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false, message: "غير مصرح لك." };
  }
  const id = profileId.trim();
  if (!/^[0-9]+$/.test(id)) {
    return { ok: false, message: "معرّف غير صالح." };
  }
  try {
    const result = await deleteCollegeAccountPermanently(id, session.uid);
    if (!result.ok) return { ok: false, message: result.message };
  } catch (err: unknown) {
    if (isRasinDbMigrationRequiredError(err)) {
      return { ok: false, message: err.message };
    }
    console.error("[deleteCollegeAccountAction]", err);
    return { ok: false, message: "تعذر حذف الحساب." };
  }
  revalidatePath("/dashboard/college-accounts");
  return { ok: true };
}
