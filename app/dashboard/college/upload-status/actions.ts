"use server";

import { revalidatePath } from "next/cache";
import { patchCollegeExamRoomAttendance, type PatchCollegeExamRoomAttendanceInput } from "@/lib/college-rooms";
import {
  approveDeanExamSituation,
  getExamSituationDetailForOwner,
  submitHeadExamSituation,
} from "@/lib/college-exam-situations";
import { getSession } from "@/lib/session";

export type SituationActionState = { ok: true; message: string } | { ok: false; message: string } | null;

export async function patchRoomAttendanceForSituationAction(
  _prev: SituationActionState,
  formData: FormData
): Promise<SituationActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const scheduleId = String(formData.get("schedule_id") ?? "").trim();
  if (!/^\d+$/.test(scheduleId)) return { ok: false, message: "معرّف الجدول غير صالح." };
  const detail = await getExamSituationDetailForOwner(session.uid, scheduleId);
  if (!detail) return { ok: false, message: "لا يمكن الوصول لهذا الجدول." };
  const cm = detail.capacity_morning;
  const ce = detail.capacity_evening;
  const base = {
    roomId: detail.room_id,
    ownerUserId: session.uid,
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
  revalidatePath("/dashboard/college/upload-status");
  revalidatePath(`/dashboard/college/upload-status/${scheduleId}`);
  revalidatePath("/dashboard/college/rooms-management");
  return { ok: true, message: "تم حفظ بيانات الحضور والغياب وتحديث القاعة." };
}

export async function submitHeadSituationAction(
  _prev: SituationActionState,
  formData: FormData
): Promise<SituationActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const scheduleId = String(formData.get("schedule_id") ?? "").trim();
  const res = await submitHeadExamSituation({ ownerUserId: session.uid, scheduleId });
  if (!res.ok) return res;
  revalidatePath("/dashboard/college/upload-status");
  revalidatePath(`/dashboard/college/upload-status/${scheduleId}`);
  revalidatePath("/dashboard/college/status-followup");
  return { ok: true, message: "تم تأكيد رفع الموقف للمتابعة." };
}

export async function approveDeanSituationAction(
  _prev: SituationActionState,
  formData: FormData
): Promise<SituationActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const scheduleId = String(formData.get("schedule_id") ?? "").trim();
  const deanNote = String(formData.get("dean_note") ?? "");
  const res = await approveDeanExamSituation({
    ownerUserId: session.uid,
    scheduleId,
    deanNote,
  });
  if (!res.ok) return res;
  revalidatePath("/dashboard/college/upload-status");
  revalidatePath(`/dashboard/college/upload-status/${scheduleId}`);
  revalidatePath("/dashboard/college/status-followup");
  return { ok: true, message: "تم اعتماد الموقف." };
}
