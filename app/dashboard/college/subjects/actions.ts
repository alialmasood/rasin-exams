"use server";

import { revalidatePath } from "next/cache";
import {
  createCollegeSubject,
  deleteCollegeSubject,
  updateCollegeSubject,
} from "@/lib/college-subjects";
import { getSession } from "@/lib/session";

export type CollegeSubjectsActionState = { ok: true; message: string } | { ok: false; message: string } | null;

export async function createCollegeSubjectAction(
  _prev: CollegeSubjectsActionState,
  formData: FormData
): Promise<CollegeSubjectsActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح لك بهذه العملية." };
  }
  try {
    const result = await createCollegeSubject({
      ownerUserId: session.uid,
      branchType: String(formData.get("branch_type") ?? "").trim().toUpperCase() === "BRANCH" ? "BRANCH" : "DEPARTMENT",
      branchName: String(formData.get("branch_name") ?? ""),
      branchHeadName: String(formData.get("branch_head_name") ?? ""),
    });
    if (!result.ok) return result;
    revalidatePath("/dashboard/college/subjects");
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
    revalidatePath("/dashboard/college/subjects");
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
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "معرّف العنصر غير صالح." };
  try {
    const result = await deleteCollegeSubject({
      id,
      ownerUserId: session.uid,
    });
    if (!result.ok) return result;
    revalidatePath("/dashboard/college/subjects");
    return { ok: true, message: "تم حذف القسم/الفرع بنجاح." };
  } catch {
    return { ok: false, message: "حدث خطأ أثناء حذف القسم/الفرع." };
  }
}
