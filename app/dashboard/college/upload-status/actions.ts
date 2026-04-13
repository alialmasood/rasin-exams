"use server";

import { revalidatePath } from "next/cache";
import { patchCollegeExamRoomAttendance, type PatchCollegeExamRoomAttendanceInput } from "@/lib/college-rooms";
import {
  approveDeanExamSituation,
  getExamSituationDetailForOwner,
  patchScheduleExamBooklets,
  patchScheduleSituationCheatingCases,
  patchScheduleSituationStaffAbsences,
  submitHeadExamSituation,
} from "@/lib/college-exam-situations";
import { recordCollegeActivityEvent } from "@/lib/college-activity-log";
import {
  getCollegePortalDataOwnerUserId,
  departmentCanAccessCollegeSubjectRow,
} from "@/lib/college-portal-scope";
import { revalidateCollegePortalSegment } from "@/lib/revalidate-college-portal";
import { getSession } from "@/lib/session";

export type SituationActionState = { ok: true; message: string } | { ok: false; message: string } | null;

export async function patchRoomAttendanceForSituationAction(
  _prev: SituationActionState,
  formData: FormData
): Promise<SituationActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const scheduleId = String(formData.get("schedule_id") ?? "").trim();
  if (!/^\d+$/.test(scheduleId)) return { ok: false, message: "معرّف الجدول غير صالح." };
  const detail = await getExamSituationDetailForOwner(ownerUserId, scheduleId);
  if (!detail) return { ok: false, message: "لا يمكن الوصول لهذا الجدول." };
  if (!departmentCanAccessCollegeSubjectRow(session, detail.college_subject_id)) {
    return { ok: false, message: "لا يمكن الوصول لهذا الجدول." };
  }
  const cm = detail.capacity_morning;
  const ce = detail.capacity_evening;
  const base = {
    roomId: detail.room_id,
    ownerUserId,
    studySubjectId: detail.study_subject_id,
  } as const;
  const payload: PatchCollegeExamRoomAttendanceInput =
    cm > 0 && ce > 0
      ? {
          ...base,
          mode: "split",
          attendanceMorning: String(formData.get("attendance_morning") ?? ""),
          absenceMorning: String(formData.get("absence_morning") ?? ""),
          attendanceEvening: String(formData.get("attendance_evening") ?? ""),
          absenceEvening: String(formData.get("absence_evening") ?? ""),
          absenceNamesMorning: String(formData.get("absence_names_morning") ?? ""),
          absenceNamesEvening: String(formData.get("absence_names_evening") ?? ""),
        }
      : {
          ...base,
          mode: "aggregate",
          attendanceCount: String(formData.get("attendance_count") ?? ""),
          absenceCount: String(formData.get("absence_count") ?? ""),
          absenceNames: String(formData.get("absence_names") ?? ""),
        };
  const res = await patchCollegeExamRoomAttendance(payload);
  if (!res.ok) return res;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "patch",
    resource: "room_attendance",
    summary: `تحديث بيانات الحضور/الغياب للقاعة المرتبطة بجدول ${scheduleId}.`,
    details: { scheduleId, roomId: detail.room_id },
  });
  revalidateCollegePortalSegment("upload-status");
  revalidateCollegePortalSegment(`upload-status/${scheduleId}`);
  revalidateCollegePortalSegment("rooms-management");
  return { ok: true, message: "تم حفظ بيانات الحضور والغياب وتحديث القاعة." };
}

export async function patchSituationExamBookletsAction(
  _prev: SituationActionState,
  formData: FormData
): Promise<SituationActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const scheduleId = String(formData.get("schedule_id") ?? "").trim();
  if (!/^\d+$/.test(scheduleId)) return { ok: false, message: "معرّف الجدول غير صالح." };
  const detail = await getExamSituationDetailForOwner(ownerUserId, scheduleId);
  if (!detail) return { ok: false, message: "لا يمكن الوصول لهذا الجدول." };
  if (!departmentCanAccessCollegeSubjectRow(session, detail.college_subject_id)) {
    return { ok: false, message: "لا يمكن الوصول لهذا الجدول." };
  }
  const res = await patchScheduleExamBooklets({
    ownerUserId,
    scheduleId,
    receivedRaw: String(formData.get("exam_booklets_received") ?? ""),
    usedRaw: String(formData.get("exam_booklets_used") ?? ""),
    damagedRaw: String(formData.get("exam_booklets_damaged") ?? ""),
  });
  if (!res.ok) return res;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "patch",
    resource: "situation_exam_booklets",
    summary: `تحديث أعداد الدفاتر الامتحانية للجدول ${scheduleId}.`,
    details: { scheduleId },
  });
  revalidateCollegePortalSegment("upload-status");
  revalidateCollegePortalSegment(`upload-status/${scheduleId}`);
  return { ok: true, message: "تم حفظ بيانات الدفاتر الامتحانية." };
}

export async function patchSituationStaffAbsencesAction(
  _prev: SituationActionState,
  formData: FormData
): Promise<SituationActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const scheduleId = String(formData.get("schedule_id") ?? "").trim();
  if (!/^\d+$/.test(scheduleId)) return { ok: false, message: "معرّف الجدول غير صالح." };
  const detail = await getExamSituationDetailForOwner(ownerUserId, scheduleId);
  if (!detail) return { ok: false, message: "لا يمكن الوصول لهذا الجدول." };
  if (!departmentCanAccessCollegeSubjectRow(session, detail.college_subject_id)) {
    return { ok: false, message: "لا يمكن الوصول لهذا الجدول." };
  }
  const supervisorAbsent = String(formData.get("supervisor_absent") ?? "") === "1";
  const supervisorAbsenceReason = String(formData.get("supervisor_absence_reason") ?? "");
  const supervisorSubstituteName = String(formData.get("supervisor_substitute_name") ?? "");
  const invJson = String(formData.get("invigilator_absences_json") ?? "[]");
  let invigilator_absences: { absent_name: string; absence_reason: string; substitute_name: string }[] = [];
  try {
    const parsed = JSON.parse(invJson) as unknown;
    if (Array.isArray(parsed)) {
      invigilator_absences = parsed.map((x) => ({
        absent_name: String((x as { absent_name?: string })?.absent_name ?? "").trim(),
        absence_reason: String((x as { absence_reason?: string })?.absence_reason ?? "").trim(),
        substitute_name: String((x as { substitute_name?: string })?.substitute_name ?? "").trim(),
      }));
    }
  } catch {
    return { ok: false, message: "بيانات غياب المراقبين غير صالحة." };
  }
  const state = {
    supervisor_absent: supervisorAbsent,
    supervisor_absence_reason: supervisorAbsenceReason,
    supervisor_substitute_name: supervisorSubstituteName,
    invigilator_absences,
  };
  const res = await patchScheduleSituationStaffAbsences({ ownerUserId, scheduleId, state });
  if (!res.ok) return res;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "patch",
    resource: "situation_staff_absences",
    summary: `تحديث غياب مشرف/مراقبين للجدول ${scheduleId}.`,
    details: { scheduleId },
  });
  revalidateCollegePortalSegment("upload-status");
  revalidateCollegePortalSegment(`upload-status/${scheduleId}`);
  return { ok: true, message: "تم حفظ بيانات غياب المشرف والمراقبين." };
}

export async function patchSituationCheatingCasesAction(
  _prev: SituationActionState,
  formData: FormData
): Promise<SituationActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const scheduleId = String(formData.get("schedule_id") ?? "").trim();
  if (!/^\d+$/.test(scheduleId)) return { ok: false, message: "معرّف الجدول غير صالح." };
  const detail = await getExamSituationDetailForOwner(ownerUserId, scheduleId);
  if (!detail) return { ok: false, message: "لا يمكن الوصول لهذا الجدول." };
  if (!departmentCanAccessCollegeSubjectRow(session, detail.college_subject_id)) {
    return { ok: false, message: "لا يمكن الوصول لهذا الجدول." };
  }
  const cheatingReported = String(formData.get("cheating_reported") ?? "") === "1";
  const casesJson = String(formData.get("cheating_cases_json") ?? "[]");
  let cases: { student_name: string; notes: string }[] = [];
  try {
    const parsed = JSON.parse(casesJson) as unknown;
    if (Array.isArray(parsed)) {
      cases = parsed.map((x) => ({
        student_name: String((x as { student_name?: string })?.student_name ?? "").trim(),
        notes: String((x as { notes?: string })?.notes ?? "").trim(),
      }));
    }
  } catch {
    return { ok: false, message: "بيانات حالات الغش غير صالحة." };
  }
  const state = { cheating_reported: cheatingReported, cases };
  const res = await patchScheduleSituationCheatingCases({ ownerUserId, scheduleId, state });
  if (!res.ok) return res;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "patch",
    resource: "situation_cheating_cases",
    summary: `تحديث حالات الغش للجدول ${scheduleId}.`,
    details: { scheduleId },
  });
  revalidateCollegePortalSegment("upload-status");
  revalidateCollegePortalSegment(`upload-status/${scheduleId}`);
  return { ok: true, message: "تم حفظ بيانات حالات الغش." };
}

export async function submitHeadSituationAction(
  _prev: SituationActionState,
  formData: FormData
): Promise<SituationActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const scheduleId = String(formData.get("schedule_id") ?? "").trim();
  const detail = await getExamSituationDetailForOwner(ownerUserId, scheduleId);
  if (!detail || !departmentCanAccessCollegeSubjectRow(session, detail.college_subject_id)) {
    return { ok: false, message: "لا يمكن الوصول لهذا الجدول." };
  }
  const res = await submitHeadExamSituation({ ownerUserId, scheduleId });
  if (!res.ok) return res;
  revalidateCollegePortalSegment("upload-status");
  revalidateCollegePortalSegment(`upload-status/${scheduleId}`);
  revalidateCollegePortalSegment("status-followup");
  revalidatePath("/tracking");
  return { ok: true, message: "تم تأكيد رفع الموقف للمتابعة." };
}

export async function approveDeanSituationAction(
  _prev: SituationActionState,
  formData: FormData
): Promise<SituationActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const scheduleId = String(formData.get("schedule_id") ?? "").trim();
  const deanNote = String(formData.get("dean_note") ?? "");
  const detail = await getExamSituationDetailForOwner(ownerUserId, scheduleId);
  if (!detail || !departmentCanAccessCollegeSubjectRow(session, detail.college_subject_id)) {
    return { ok: false, message: "لا يمكن الوصول لهذا الجدول." };
  }
  const res = await approveDeanExamSituation({
    ownerUserId,
    scheduleId,
    deanNote,
  });
  if (!res.ok) return res;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "approve",
    resource: "situation_report",
    summary: `اعتماد الموقف الامتحاني من عميد/معاون (جدول ${scheduleId}).`,
    details: { scheduleId },
  });
  revalidateCollegePortalSegment("upload-status");
  revalidateCollegePortalSegment(`upload-status/${scheduleId}`);
  revalidateCollegePortalSegment("status-followup");
  revalidatePath("/tracking");
  return { ok: true, message: "تم اعتماد الموقف." };
}
