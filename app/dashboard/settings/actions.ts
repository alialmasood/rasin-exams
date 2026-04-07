"use server";

import { revalidatePath } from "next/cache";
import { isAdminRole, type UserRole } from "@/lib/authz";
import { setShowCollegeExamSituationUploadCta } from "@/lib/app-settings";
import { getSession } from "@/lib/session";

export type UpdateShowCtaResult = { ok: true } | { ok: false; error: string };

export async function updateShowCollegeExamSituationCtaAction(
  _prev: UpdateShowCtaResult | undefined,
  formData: FormData
): Promise<UpdateShowCtaResult> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false, error: "غير مصرّح لك بتعديل الإعدادات." };
  }
  const raw = formData.get("show_cta");
  if (raw !== "true" && raw !== "false") {
    return { ok: false, error: "اختر إظهاراً أو إخفاءً ثم أعد المحاولة." };
  }
  const visible = raw === "true";
  try {
    await setShowCollegeExamSituationUploadCta(visible, session.uid);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "تعذر حفظ الإعداد.";
    return { ok: false, error: msg };
  }
  revalidatePath("/dashboard/college");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
