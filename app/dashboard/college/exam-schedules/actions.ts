"use server";

import {
  createCollegeExamSchedule,
  deleteCollegeExamSchedule,
  reviewCollegeExamScheduleContext,
  submitCollegeExamScheduleContext,
  updateCollegeExamSchedule,
} from "@/lib/college-exam-schedules";
import { createCollegeHoliday, deleteCollegeHoliday } from "@/lib/college-holidays";
import type { UserRole } from "@/lib/authz";
import { isAdminRole } from "@/lib/authz";
import { getSession } from "@/lib/session";

export type ExamScheduleActionResult<T = unknown> =
  | { ok: true; message: string; data?: T }
  | { ok: false; message: string };

export async function createExamScheduleAction(formData: FormData): Promise<ExamScheduleActionResult> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const result = await createCollegeExamSchedule({
    ownerUserId: session.uid,
    collegeSubjectId: String(formData.get("college_subject_id") ?? ""),
    studySubjectId: String(formData.get("study_subject_id") ?? ""),
    roomId: String(formData.get("room_id") ?? ""),
    stageLevel: String(formData.get("stage_level") ?? ""),
    scheduleType: String(formData.get("schedule_type") ?? ""),
    termLabel: String(formData.get("term_label") ?? ""),
    academicYear: String(formData.get("academic_year") ?? ""),
    examDate: String(formData.get("exam_date") ?? ""),
    startTime: String(formData.get("start_time") ?? ""),
    endTime: String(formData.get("end_time") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!result.ok) return result;
  return { ok: true, message: "تمت إضافة المادة إلى الجدول الامتحاني بنجاح", data: result.row };
}

export async function updateExamScheduleAction(formData: FormData): Promise<ExamScheduleActionResult> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "معرّف الإدخال غير صالح." };
  const result = await updateCollegeExamSchedule({
    id,
    ownerUserId: session.uid,
    collegeSubjectId: String(formData.get("college_subject_id") ?? ""),
    studySubjectId: String(formData.get("study_subject_id") ?? ""),
    roomId: String(formData.get("room_id") ?? ""),
    stageLevel: String(formData.get("stage_level") ?? ""),
    scheduleType: String(formData.get("schedule_type") ?? ""),
    termLabel: String(formData.get("term_label") ?? ""),
    academicYear: String(formData.get("academic_year") ?? ""),
    examDate: String(formData.get("exam_date") ?? ""),
    startTime: String(formData.get("start_time") ?? ""),
    endTime: String(formData.get("end_time") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!result.ok) return result;
  return { ok: true, message: "تم حفظ التعديلات بنجاح", data: result.row };
}

export async function deleteExamScheduleAction(formData: FormData): Promise<ExamScheduleActionResult<{ id: string }>> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "معرّف الإدخال غير صالح." };
  const result = await deleteCollegeExamSchedule({ id, ownerUserId: session.uid });
  if (!result.ok) return result;
  return { ok: true, message: "تم حذف الإدخال", data: { id } };
}

export async function submitExamScheduleContextAction(formData: FormData): Promise<ExamScheduleActionResult> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const result = await submitCollegeExamScheduleContext({
    ownerUserId: session.uid,
    collegeSubjectId: String(formData.get("college_subject_id") ?? ""),
    scheduleType: String(formData.get("schedule_type") ?? ""),
    termLabel: String(formData.get("term_label") ?? ""),
    academicYear: String(formData.get("academic_year") ?? ""),
  });
  if (!result.ok) return result;
  return { ok: true, message: "تم رفع الجدول إلى المتابعة بنجاح." };
}

export async function createHolidayAction(formData: FormData): Promise<ExamScheduleActionResult> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const result = await createCollegeHoliday({
    ownerUserId: session.uid,
    holidayDate: String(formData.get("holiday_date") ?? ""),
    holidayName: String(formData.get("holiday_name") ?? ""),
  });
  if (!result.ok) return result;
  return { ok: true, message: "تمت إضافة العطلة بنجاح.", data: result.row };
}

export async function deleteHolidayAction(formData: FormData): Promise<ExamScheduleActionResult<{ id: string }>> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "معرّف العطلة غير صالح." };
  const result = await deleteCollegeHoliday({ id, ownerUserId: session.uid });
  if (!result.ok) return result;
  return { ok: true, message: "تم حذف العطلة.", data: { id } };
}

export async function approveExamScheduleContextAction(formData: FormData): Promise<ExamScheduleActionResult> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const result = await reviewCollegeExamScheduleContext({
    reviewerUserId: session.uid,
    ownerUserId: String(formData.get("owner_user_id") ?? ""),
    collegeSubjectId: String(formData.get("college_subject_id") ?? ""),
    scheduleType: String(formData.get("schedule_type") ?? ""),
    termLabel: String(formData.get("term_label") ?? ""),
    academicYear: String(formData.get("academic_year") ?? ""),
    decision: "APPROVED",
    reviewNote: String(formData.get("review_note") ?? ""),
  });
  if (!result.ok) return result;
  return { ok: true, message: "تم اعتماد الجدول بنجاح." };
}

export async function rejectExamScheduleContextAction(formData: FormData): Promise<ExamScheduleActionResult> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const result = await reviewCollegeExamScheduleContext({
    reviewerUserId: session.uid,
    ownerUserId: String(formData.get("owner_user_id") ?? ""),
    collegeSubjectId: String(formData.get("college_subject_id") ?? ""),
    scheduleType: String(formData.get("schedule_type") ?? ""),
    termLabel: String(formData.get("term_label") ?? ""),
    academicYear: String(formData.get("academic_year") ?? ""),
    decision: "REJECTED",
    reviewNote: String(formData.get("review_note") ?? ""),
  });
  if (!result.ok) return result;
  return { ok: true, message: "تم رفض الجدول وإعادته للمراجعة." };
}
