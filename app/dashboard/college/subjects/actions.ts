"use server";

import { revalidatePath } from "next/cache";
import {
  createCollegeSubject,
  deleteCollegeSubject,
  updateCollegeSubject,
} from "@/lib/college-subjects";
import { recordCollegeActivityEvent } from "@/lib/college-activity-log";
import { getSession } from "@/lib/session";

export type CollegeSubjectsActionState = { ok: true; message: string } | { ok: false; message: string } | null;

function revalidateCollegeSubjectsSurfaces() {
  revalidatePath("/dashboard/college/subjects");
  revalidatePath("/dashboard/college");
  /** شجرة `/dashboard` كاملة (لوحة الإدمن `/dashboard` وجميع الصفلات الفرعية) */
  revalidatePath("/dashboard", "layout");
}

export async function createCollegeSubjectAction(
  _prev: CollegeSubjectsActionState,
  formData: FormData
): Promise<CollegeSubjectsActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح لك بهذه العملية." };
  }
  if (session.college_account_kind === "DEPARTMENT") {
    return { ok: false, message: "إدارة الأقسام متاحة لحساب التشكيل فقط." };
  }
  try {
    const result = await createCollegeSubject({
      ownerUserId: session.uid,
      branchType: String(formData.get("branch_type") ?? "").trim().toUpperCase() === "BRANCH" ? "BRANCH" : "DEPARTMENT",
      branchName: String(formData.get("branch_name") ?? ""),
      branchHeadName: String(formData.get("branch_head_name") ?? ""),
    });
    if (!result.ok) return result;
    void recordCollegeActivityEvent({
      ownerUserId: session.uid,
      action: "create",
      resource: "college_subject",
      summary: `إضافة قسم أو فرع: ${String(formData.get("branch_name") ?? "").trim() || "—"}.`,
    });
    revalidateCollegeSubjectsSurfaces();
    return { ok: true, message: "تمت إضافة القسم/الفرع بنجاح." };
  } catch {
    return { ok: false, message: "حدث خطأ أثناء إضافة القسم/الفرع." };
  }
}

export async function updateCollegeSubjectAction(
  _prev: CollegeSubjectsActionState,
  formData: FormData
): Promise<CollegeSubjectsActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح لك بهذه العملية." };
  }
  if (session.college_account_kind === "DEPARTMENT") {
    return { ok: false, message: "إدارة الأقسام متاحة لحساب التشكيل فقط." };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "معرّف العنصر غير صالح." };
  try {
    const result = await updateCollegeSubject({
      id,
      ownerUserId: session.uid,
      branchType: String(formData.get("branch_type") ?? "").trim().toUpperCase() === "BRANCH" ? "BRANCH" : "DEPARTMENT",
      branchName: String(formData.get("branch_name") ?? ""),
      branchHeadName: String(formData.get("branch_head_name") ?? ""),
    });
    if (!result.ok) return result;
    revalidateCollegeSubjectsSurfaces();
    return { ok: true, message: "تم تحديث القسم/الفرع بنجاح." };
  } catch {
    return { ok: false, message: "حدث خطأ أثناء تحديث القسم/الفرع." };
  }
}

export async function deleteCollegeSubjectAction(
  _prev: CollegeSubjectsActionState,
  formData: FormData
): Promise<CollegeSubjectsActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح لك بهذه العملية." };
  }
  if (session.college_account_kind === "DEPARTMENT") {
    return { ok: false, message: "إدارة الأقسام متاحة لحساب التشكيل فقط." };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "معرّف العنصر غير صالح." };
  try {
    const result = await deleteCollegeSubject({
      id,
      ownerUserId: session.uid,
    });
    if (!result.ok) return result;
    void recordCollegeActivityEvent({
      ownerUserId: session.uid,
      action: "delete",
      resource: "college_subject",
      summary: `حذف قسم/فرع (المعرّف ${id}).`,
      details: { subjectId: id },
    });
    revalidateCollegeSubjectsSurfaces();
    return { ok: true, message: "تم حذف القسم/الفرع بنجاح." };
  } catch {
    return { ok: false, message: "حدث خطأ أثناء حذف القسم/الفرع." };
  }
}
