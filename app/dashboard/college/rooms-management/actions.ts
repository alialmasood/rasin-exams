"use server";

import {
  createCollegeExamRoom,
  deleteCollegeExamRoom,
  inferredShiftFromTotals,
  updateCollegeExamRoom,
  type ShiftAttendanceSplit,
} from "@/lib/college-rooms";
import { recordCollegeActivityEvent } from "@/lib/college-activity-log";
import { getCollegePortalDataOwnerUserId } from "@/lib/college-portal-scope";
import { revalidateCollegePortalSegment } from "@/lib/revalidate-college-portal";
import { getSession } from "@/lib/session";

export type CollegeRoomsActionState = { ok: true; message: string } | { ok: false; message: string } | null;

function fdStr(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function toIntStr(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/** دمج أسماء غياب الصباحي والمسائي لحقل التخزين الواحد */
function mergeAbsenceNames(morning: string, evening: string): string {
  const m = morning.trim();
  const e = evening.trim();
  if (!e) return m;
  if (!m) return e;
  return `${m}\n--- دوام مسائي ---\n${e}`;
}

const ZERO_SHIFT: ShiftAttendanceSplit = { attM: 0, absM: 0, attE: 0, absE: 0, namesM: "", namesE: "" };

/** عند وجود حقول s1_att_m ندمج صباحي/مسائي؛ وإلا نقرأ attendance_count الكلاسيكي (مثل إضافة قاعة). */
function slot1FromForm(formData: FormData, useSplitAttendance: boolean) {
  if (!useSplitAttendance) {
    const capM = toIntStr(fdStr(formData, "capacity_morning"));
    const capE = toIntStr(fdStr(formData, "capacity_evening"));
    const ac = toIntStr(fdStr(formData, "attendance_count"));
    const ab = toIntStr(fdStr(formData, "absence_count"));
    const names = fdStr(formData, "absence_names");
    return {
      capacityEvening: fdStr(formData, "capacity_evening"),
      attendanceCount: fdStr(formData, "attendance_count"),
      absenceCount: fdStr(formData, "absence_count"),
      absenceNames: names,
      shiftSplit: inferredShiftFromTotals(capM, capE, ac, ab, names),
    };
  }
  const capERaw = fdStr(formData, "capacity_evening");
  const capE = toIntStr(capERaw);
  const hasEvening = capE > 0;
  const attM = toIntStr(fdStr(formData, "s1_att_m"));
  const attE = hasEvening ? toIntStr(fdStr(formData, "s1_att_e")) : 0;
  const absM = toIntStr(fdStr(formData, "s1_abs_m"));
  const absE = hasEvening ? toIntStr(fdStr(formData, "s1_abs_e")) : 0;
  const namesM = fdStr(formData, "s1_names_m");
  const namesE = hasEvening ? fdStr(formData, "s1_names_e") : "";
  const shiftSplit: ShiftAttendanceSplit = {
    attM,
    absM,
    attE,
    absE,
    namesM,
    namesE,
  };
  return {
    capacityEvening: capERaw || "0",
    attendanceCount: String(attM + attE),
    absenceCount: String(absM + absE),
    absenceNames: mergeAbsenceNames(namesM, namesE),
    shiftSplit,
  };
}

function slot2FromForm(formData: FormData, useSplitAttendance: boolean, hasSecondExam: boolean) {
  if (!hasSecondExam) {
    return {
      capacityEvening: "0",
      attendanceCount: fdStr(formData, "attendance_count_2") || "0",
      absenceCount: fdStr(formData, "absence_count_2") || "0",
      absenceNames: fdStr(formData, "absence_names_2"),
      shiftSplit: ZERO_SHIFT,
    };
  }
  if (!useSplitAttendance) {
    const capM = toIntStr(fdStr(formData, "capacity_morning_2"));
    const capE = toIntStr(fdStr(formData, "capacity_evening_2"));
    const ac = toIntStr(fdStr(formData, "attendance_count_2"));
    const ab = toIntStr(fdStr(formData, "absence_count_2"));
    const names = fdStr(formData, "absence_names_2");
    return {
      capacityEvening: fdStr(formData, "capacity_evening_2"),
      attendanceCount: fdStr(formData, "attendance_count_2"),
      absenceCount: fdStr(formData, "absence_count_2"),
      absenceNames: names,
      shiftSplit: inferredShiftFromTotals(capM, capE, ac, ab, names),
    };
  }
  const cap2Raw = fdStr(formData, "capacity_evening_2");
  const cap2 = toIntStr(cap2Raw);
  const hasEvening = cap2 > 0;
  const attM = toIntStr(fdStr(formData, "s2_att_m"));
  const attE = hasEvening ? toIntStr(fdStr(formData, "s2_att_e")) : 0;
  const absM = toIntStr(fdStr(formData, "s2_abs_m"));
  const absE = hasEvening ? toIntStr(fdStr(formData, "s2_abs_e")) : 0;
  const namesM = fdStr(formData, "s2_names_m");
  const namesE = hasEvening ? fdStr(formData, "s2_names_e") : "";
  const shiftSplit: ShiftAttendanceSplit = { attM, absM, attE, absE, namesM, namesE };
  return {
    capacityEvening: cap2Raw || "0",
    attendanceCount: String(attM + attE),
    absenceCount: String(absM + absE),
    absenceNames: mergeAbsenceNames(namesM, namesE),
    shiftSplit,
  };
}

export async function createCollegeExamRoomAction(
  _prev: CollegeRoomsActionState,
  formData: FormData
): Promise<CollegeRoomsActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const useSplitAttendance = formData.has("s1_att_m");
  const hasSecondExam = fdStr(formData, "study_subject_id_2").trim() !== "";
  const s1 = slot1FromForm(formData, useSplitAttendance);
  const s2 = slot2FromForm(formData, useSplitAttendance, hasSecondExam);
  const result = await createCollegeExamRoom({
    ownerUserId,
    studySubjectId: fdStr(formData, "study_subject_id"),
    studySubjectId2: fdStr(formData, "study_subject_id_2"),
    roomName: fdStr(formData, "room_name"),
    supervisorName: fdStr(formData, "supervisor_name"),
    invigilators: fdStr(formData, "invigilators"),
    capacityMorning: fdStr(formData, "capacity_morning"),
    capacityEvening: s1.capacityEvening,
    capacityMorning2: hasSecondExam ? fdStr(formData, "capacity_morning_2") : "0",
    capacityEvening2: hasSecondExam ? s2.capacityEvening : "0",
    attendanceCount: s1.attendanceCount,
    absenceCount: s1.absenceCount,
    absenceNames: s1.absenceNames,
    attendanceCount2: s2.attendanceCount,
    absenceCount2: s2.absenceCount,
    absenceNames2: s2.absenceNames,
    stageLevel: fdStr(formData, "stage_level"),
    stageLevel2: fdStr(formData, "stage_level_2"),
    shift1Attendance: s1.shiftSplit,
    shift2Attendance: s2.shiftSplit,
    externalRoomStaffJson: fdStr(formData, "external_room_staff_json"),
  });
  if (!result.ok) return result;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "create",
    resource: "exam_room",
    summary: `إضافة قاعة امتحانية: ${fdStr(formData, "room_name").trim() || "—"}.`,
  });
  revalidateCollegePortalSegment("rooms-management");
  return { ok: true, message: "تمت إضافة القاعة بنجاح." };
}

export async function updateCollegeExamRoomAction(
  _prev: CollegeRoomsActionState,
  formData: FormData
): Promise<CollegeRoomsActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const id = fdStr(formData, "id").trim();
  if (!id) return { ok: false, message: "معرّف القاعة غير صالح." };
  const useSplitAttendance = formData.has("s1_att_m");
  const hasSecondExam = fdStr(formData, "study_subject_id_2").trim() !== "";
  const s1 = slot1FromForm(formData, useSplitAttendance);
  const s2 = slot2FromForm(formData, useSplitAttendance, hasSecondExam);
  const result = await updateCollegeExamRoom({
    id,
    ownerUserId,
    studySubjectId: fdStr(formData, "study_subject_id"),
    studySubjectId2: fdStr(formData, "study_subject_id_2"),
    serialNo: fdStr(formData, "serial_no"),
    roomName: fdStr(formData, "room_name"),
    supervisorName: fdStr(formData, "supervisor_name"),
    invigilators: fdStr(formData, "invigilators"),
    capacityMorning: fdStr(formData, "capacity_morning"),
    capacityEvening: s1.capacityEvening,
    capacityMorning2: hasSecondExam ? fdStr(formData, "capacity_morning_2") : "0",
    capacityEvening2: hasSecondExam ? s2.capacityEvening : "0",
    attendanceCount: s1.attendanceCount,
    absenceCount: s1.absenceCount,
    absenceNames: s1.absenceNames,
    attendanceCount2: s2.attendanceCount,
    absenceCount2: s2.absenceCount,
    absenceNames2: s2.absenceNames,
    stageLevel: fdStr(formData, "stage_level"),
    stageLevel2: fdStr(formData, "stage_level_2"),
    shift1Attendance: s1.shiftSplit,
    shift2Attendance: s2.shiftSplit,
    externalRoomStaffJson: fdStr(formData, "external_room_staff_json"),
  });
  if (!result.ok) return result;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "update",
    resource: "exam_room",
    summary: `تحديث قاعة امتحانية (المعرّف ${id}): ${fdStr(formData, "room_name").trim() || "—"}.`,
    details: { roomId: id },
  });
  revalidateCollegePortalSegment("rooms-management");
  return { ok: true, message: "تم تحديث القاعة بنجاح." };
}

export async function deleteCollegeExamRoomAction(
  _prev: CollegeRoomsActionState,
  formData: FormData
): Promise<CollegeRoomsActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const id = fdStr(formData, "id").trim();
  if (!id) return { ok: false, message: "معرّف القاعة غير صالح." };
  const result = await deleteCollegeExamRoom({
    id,
    ownerUserId,
  });
  if (!result.ok) return result;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "delete",
    resource: "exam_room",
    summary: `حذف قاعة امتحانية (المعرّف ${id}).`,
    details: { roomId: id },
  });
  revalidateCollegePortalSegment("rooms-management");
  return { ok: true, message: "تم حذف القاعة بنجاح." };
}
