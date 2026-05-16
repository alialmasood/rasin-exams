"use server";

import {
  createCollegeExamSchedulesMultiRoom,
  deleteCollegeExamSchedule,
  reviewCollegeExamScheduleContext,
  updateCollegeExamSchedule,
} from "@/lib/college-exam-schedules";
import { createCollegeHoliday, deleteCollegeHoliday } from "@/lib/college-holidays";
import type { UserRole } from "@/lib/authz";
import { isAdminRole } from "@/lib/authz";
import { recordCollegeActivityEvent } from "@/lib/college-activity-log";
import {
  isExamScheduleAllBranchesChoice,
  resolveCollegeSubjectIdForExamScheduleAllBranches,
} from "@/lib/college-all-branches-resolve";
import {
  getCollegePortalDataOwnerUserId,
  effectiveCollegeSubjectIdForMutation,
} from "@/lib/college-portal-scope";
import { getSession } from "@/lib/session";

export type ExamScheduleActionResult<T = unknown> =
  | { ok: true; message: string; data?: T }
  | { ok: false; message: string };

async function resolveExamScheduleCollegeSubjectId(
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  ownerUserId: string,
  formData: FormData,
  roomIds: string[]
): Promise<{ ok: true; collegeSubjectId: string } | { ok: false; message: string }> {
  const rawBranch = String(formData.get("college_subject_id") ?? "").trim();
  if (isExamScheduleAllBranchesChoice(rawBranch)) {
    return resolveCollegeSubjectIdForExamScheduleAllBranches(
      ownerUserId,
      String(formData.get("study_subject_id") ?? ""),
      roomIds
    );
  }
  const collegeSubjectId = effectiveCollegeSubjectIdForMutation(session, rawBranch);
  if (!/^\d+$/.test(collegeSubjectId)) {
    return { ok: false, message: "يرجى اختيار القسم أو الفرع." };
  }
  return { ok: true, collegeSubjectId };
}

export async function createExamScheduleAction(formData: FormData): Promise<ExamScheduleActionResult> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const rawIds = String(formData.get("room_ids") ?? "").trim();
  const roomIds = rawIds
    ? rawIds
        .split(",")
        .map((s) => s.trim())
        .filter((x) => /^\d+$/.test(x))
    : [];
  if (roomIds.length === 0) {
    const one = String(formData.get("room_id") ?? "").trim();
    if (/^\d+$/.test(one)) roomIds.push(one);
  }
  const branchResolved = await resolveExamScheduleCollegeSubjectId(session, ownerUserId, formData, roomIds);
  if (!branchResolved.ok) return branchResolved;
  const collegeSubjectId = branchResolved.collegeSubjectId;
  const result = await createCollegeExamSchedulesMultiRoom({
    ownerUserId,
    collegeSubjectId,
    studySubjectId: String(formData.get("study_subject_id") ?? ""),
    roomIds,
    stageLevel: String(formData.get("stage_level") ?? ""),
    scheduleType: String(formData.get("schedule_type") ?? ""),
    termLabel: String(formData.get("term_label") ?? ""),
    academicYear: String(formData.get("academic_year") ?? ""),
    examDate: String(formData.get("exam_date") ?? ""),
    mealSlot: String(formData.get("meal_slot") ?? "1"),
    startTime: String(formData.get("start_time") ?? ""),
    endTime: String(formData.get("end_time") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!result.ok) return result;
  const n = result.rows.length;
  const examDate = String(formData.get("exam_date") ?? "").trim();
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "create",
    resource: "exam_schedule",
    summary:
      n > 1
        ? `إضافة جلسة امتحانية في ${n} قاعة لتاريخ ${examDate || "—"}.`
        : `إضافة جلسة امتحانية لتاريخ ${examDate || "—"}.`,
    details: { scheduleIds: result.rows.map((r) => String(r.id)), examDate },
  });
  return {
    ok: true,
    message:
      n > 1
        ? `تمت إضافة المادة إلى الجدول في ${n} قاعة امتحانية بنفس التوقيت.`
        : "تمت إضافة المادة إلى الجدول الامتحاني بنجاح",
    data: result.rows,
  };
}

export async function updateExamScheduleAction(formData: FormData): Promise<ExamScheduleActionResult> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "معرّف الإدخال غير صالح." };
  const roomId = String(formData.get("room_id") ?? "").trim();
  const branchResolved = await resolveExamScheduleCollegeSubjectId(
    session,
    ownerUserId,
    formData,
    /^\d+$/.test(roomId) ? [roomId] : []
  );
  if (!branchResolved.ok) return branchResolved;
  const collegeSubjectId = branchResolved.collegeSubjectId;
  const result = await updateCollegeExamSchedule({
    id,
    ownerUserId,
    collegeSubjectId,
    studySubjectId: String(formData.get("study_subject_id") ?? ""),
    roomId: String(formData.get("room_id") ?? ""),
    stageLevel: String(formData.get("stage_level") ?? ""),
    scheduleType: String(formData.get("schedule_type") ?? ""),
    termLabel: String(formData.get("term_label") ?? ""),
    academicYear: String(formData.get("academic_year") ?? ""),
    examDate: String(formData.get("exam_date") ?? ""),
    mealSlot: String(formData.get("meal_slot") ?? "1"),
    startTime: String(formData.get("start_time") ?? ""),
    endTime: String(formData.get("end_time") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!result.ok) return result;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "update",
    resource: "exam_schedule",
    summary: `تحديث جدول امتحاني (المعرّف ${id}).`,
    details: { scheduleId: id },
  });
  return { ok: true, message: "تم حفظ التعديلات بنجاح", data: result.row };
}

export async function deleteExamScheduleAction(formData: FormData): Promise<ExamScheduleActionResult<{ id: string }>> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "معرّف الإدخال غير صالح." };
  const result = await deleteCollegeExamSchedule({ id, ownerUserId });
  if (!result.ok) return result;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "delete",
    resource: "exam_schedule",
    summary: `حذف جلسة من الجدول الامتحاني (المعرّف ${id}).`,
    details: { scheduleId: id },
  });
  return { ok: true, message: "تم حذف الإدخال", data: { id } };
}

export async function createHolidayAction(formData: FormData): Promise<ExamScheduleActionResult> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const result = await createCollegeHoliday({
    ownerUserId,
    holidayDate: String(formData.get("holiday_date") ?? ""),
    holidayName: String(formData.get("holiday_name") ?? ""),
  });
  if (!result.ok) return result;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "create",
    resource: "holiday",
    summary: `إضافة عطلة: ${String(formData.get("holiday_name") ?? "").trim() || "—"} (${String(formData.get("holiday_date") ?? "").trim() || "—"}).`,
  });
  return { ok: true, message: "تمت إضافة العطلة بنجاح.", data: result.row };
}

export async function deleteHolidayAction(formData: FormData): Promise<ExamScheduleActionResult<{ id: string }>> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "معرّف العطلة غير صالح." };
  const result = await deleteCollegeHoliday({ id, ownerUserId });
  if (!result.ok) return result;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "delete",
    resource: "holiday",
    summary: `حذف عطلة (المعرّف ${id}).`,
    details: { holidayId: id },
  });
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
  const ownerUserId = String(formData.get("owner_user_id") ?? "").trim();
  if (ownerUserId) {
    void recordCollegeActivityEvent({
      ownerUserId,
      action: "approve",
      resource: "exam_schedule_context",
      summary: "اعتماد إداري لسياق جدول امتحاني (موافقة من الإدارة).",
      details: { reviewerUserId: session.uid },
    });
  }
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
  const ownerUserId = String(formData.get("owner_user_id") ?? "").trim();
  if (ownerUserId) {
    void recordCollegeActivityEvent({
      ownerUserId,
      action: "reject",
      resource: "exam_schedule_context",
      summary: "رفض إداري لسياق جدول امتحاني وإعادته للمراجعة.",
      details: { reviewerUserId: session.uid },
    });
  }
  return { ok: true, message: "تم رفض الجدول وإعادته للمراجعة." };
}
