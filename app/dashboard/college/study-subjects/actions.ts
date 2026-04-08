"use server";

import {
  createCollegeStudySubject,
  deleteCollegeStudySubject,
  updateCollegeStudySubject,
} from "@/lib/college-study-subjects";
import { recordCollegeActivityEvent } from "@/lib/college-activity-log";
import {
  getCollegePortalDataOwnerUserId,
  effectiveCollegeSubjectIdForMutation,
} from "@/lib/college-portal-scope";
import { revalidateCollegePortalSegment } from "@/lib/revalidate-college-portal";
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
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح لك بهذه العملية." };
  try {
    const collegeSubjectId = effectiveCollegeSubjectIdForMutation(
      session,
      String(formData.get("college_subject_id") ?? "")
    );
    const result = await createCollegeStudySubject({
      ownerUserId,
      collegeSubjectId,
      subjectName: String(formData.get("subject_name") ?? ""),
      instructorName: String(formData.get("instructor_name") ?? ""),
      studyType: String(formData.get("study_type") ?? ""),
      studyStageLevel: String(formData.get("study_stage_level") ?? "1"),
    });
    if (!result.ok) return result;
    void recordCollegeActivityEvent({
      ownerUserId,
      action: "create",
      resource: "study_subject",
      summary: `إضافة مادة دراسية: ${String(formData.get("subject_name") ?? "").trim() || "—"}.`,
    });
    revalidateCollegePortalSegment("study-subjects");
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
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "معرّف المادة غير صالح." };
  try {
    const collegeSubjectId = effectiveCollegeSubjectIdForMutation(
      session,
      String(formData.get("college_subject_id") ?? "")
    );
    const result = await updateCollegeStudySubject({
      id,
      ownerUserId,
      collegeSubjectId,
      subjectName: String(formData.get("subject_name") ?? ""),
      instructorName: String(formData.get("instructor_name") ?? ""),
      studyType: String(formData.get("study_type") ?? ""),
      studyStageLevel: String(formData.get("study_stage_level") ?? "1"),
    });
    if (!result.ok) return result;
    void recordCollegeActivityEvent({
      ownerUserId,
      action: "update",
      resource: "study_subject",
      summary: `تحديث مادة دراسية (المعرّف ${id}): ${String(formData.get("subject_name") ?? "").trim() || "—"}.`,
      details: { studySubjectId: id },
    });
    revalidateCollegePortalSegment("study-subjects");
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
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "معرّف المادة غير صالح." };
  try {
    const result = await deleteCollegeStudySubject({
      id,
      ownerUserId,
    });
    if (!result.ok) return result;
    void recordCollegeActivityEvent({
      ownerUserId,
      action: "delete",
      resource: "study_subject",
      summary: `حذف مادة دراسية (المعرّف ${id}).`,
      details: { studySubjectId: id },
    });
    revalidateCollegePortalSegment("study-subjects");
    return { ok: true, message: "تم حذف المادة الدراسية بنجاح." };
  } catch {
    return { ok: false, message: "حدث خطأ أثناء حذف المادة الدراسية." };
  }
}
