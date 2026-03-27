"use server";

import { revalidatePath } from "next/cache";
import { patchCollegeExamRoomAttendance } from "@/lib/college-rooms";
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
  const res = await patchCollegeExamRoomAttendance({
    roomId: detail.room_id,
    ownerUserId: session.uid,
    studySubjectId: detail.study_subject_id,
    attendanceCount: String(formData.get("attendance_count") ?? ""),
    absenceCount: String(formData.get("absence_count") ?? ""),
    absenceNames: String(formData.get("absence_names") ?? ""),
  });
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
  return { ok: true, message: "تم اعتماد الموقف." };
}
