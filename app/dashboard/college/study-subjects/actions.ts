"use server";

import { revalidatePath } from "next/cache";
import {
  createCollegeStudySubject,
  deleteCollegeStudySubject,
  updateCollegeStudySubject,
} from "@/lib/college-study-subjects";
import { getSession } from "@/lib/session";

export type CollegeStudySubjectsActionState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

export async function createCollegeStudySubjectAction(
  _prev: CollegeStudySubjectsActionState,
  formData: FormData
): Promise<CollegeStudySubjectsActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  try {
    const result = await createCollegeStudySubject({
      ownerUserId: session.uid,
      collegeSubjectId: String(formData.get("college_subject_id") ?? ""),
      subjectName: String(formData.get("subject_name") ?? ""),
      instructorName: String(formData.get("instructor_name") ?? ""),
      studyType: String(formData.get("study_type") ?? ""),
      studyStageLevel: String(formData.get("study_stage_level") ?? "1"),
    });
    if (!result.ok) return result;
    revalidatePath("/dashboard/college/study-subjects");
    return { ok: true, message: "تمت إضافة المادة الدراسية بنجاح." };
  } catch {
    return { ok: false, message: "حدث خطأ أثناء إضافة المادة الدراسية." };
  }
}

export async function updateCollegeStudySubjectAction(
  _prev: CollegeStudySubjectsActionState,
  formData: FormData
): Promise<CollegeStudySubjectsActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "معرّف المادة غير صالح." };
  try {
    const result = await updateCollegeStudySubject({
      id,
      ownerUserId: session.uid,
      collegeSubjectId: String(formData.get("college_subject_id") ?? ""),
      subjectName: String(formData.get("subject_name") ?? ""),
      instructorName: String(formData.get("instructor_name") ?? ""),
      studyType: String(formData.get("study_type") ?? ""),
      studyStageLevel: String(formData.get("study_stage_level") ?? "1"),
    });
    if (!result.ok) return result;
    revalidatePath("/dashboard/college/study-subjects");
    return { ok: true, message: "تم تحديث المادة الدراسية بنجاح." };
  } catch {
    return { ok: false, message: "حدث خطأ أثناء تحديث المادة الدراسية." };
  }
}

export async function deleteCollegeStudySubjectAction(
  _prev: CollegeStudySubjectsActionState,
  formData: FormData
): Promise<CollegeStudySubjectsActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "معرّف المادة غير صالح." };
  try {
    const result = await deleteCollegeStudySubject({
      id,
      ownerUserId: session.uid,
    });
    if (!result.ok) return result;
    revalidatePath("/dashboard/college/study-subjects");
    return { ok: true, message: "تم حذف المادة الدراسية بنجاح." };
  } catch {
    return { ok: false, message: "حدث خطأ أثناء حذف المادة الدراسية." };
  }
}
