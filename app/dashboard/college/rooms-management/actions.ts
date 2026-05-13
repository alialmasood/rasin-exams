"use server";

import {
  createCollegeExamRoom,
  deleteCollegeExamRoom,
  inferredShiftFromTotals,
  updateCollegeExamRoom,
  type ShiftAttendanceSplit,
} from "@/lib/college-rooms";
import { createCollegeRoomDefinitions } from "@/lib/college-room-definitions";
import {
  COLLEGE_BRANCH_ALL_SENTINEL,
  normalizeCollegeRoomDefinitionName,
} from "@/lib/college-room-definitions-shared";
import { listCollegeSubjectsByOwner } from "@/lib/college-subjects";
import { recordCollegeActivityEvent } from "@/lib/college-activity-log";
import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { effectiveCollegeSubjectIdForMutation, getCollegePortalDataOwnerUserId } from "@/lib/college-portal-scope";
import { revalidateCollegePortalSegment } from "@/lib/revalidate-college-portal";
import { getSession } from "@/lib/session";

/**
 * مواد «لكل الكلية» في college_study_subjects تُخزَّن بـ college_subject_id = NULL؛ عند اختيار «كل الكلية» في واجهة القاعات
 * نستنتج الفرع من القاعات المختارة (سجل التعريف) بحيث يوجد قسم/فرع واحد يضم جميع مفاتيح أسماء القاعات.
 */
async function inferCollegeSubjectIdFromRoomDefinitionsBulk(
  ownerUserId: string,
  roomNames: string[]
): Promise<{ ok: true; collegeSubjectId: string } | { ok: false; message: string }> {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const rn of roomNames) {
    const n = normalizeCollegeRoomDefinitionName(rn);
    if (!n) {
      return {
        ok: false,
        message: "تعذر ربط القاعات بفرع: أسماء القاعات غير صالحة لتعريف السجل المرجعي.",
      };
    }
    if (!seen.has(n.roomNameKey)) {
      seen.add(n.roomNameKey);
      keys.push(n.roomNameKey);
    }
  }
  if (keys.length === 0) {
    return {
      ok: false,
      message: "أدخل قاعة واحدة على الأقل ليُستنتج الفرع عند اختيار «كل الكلية» مع مادة مشتركة على مستوى الكلية.",
    };
  }
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const pool = getDbPool();
  const q = await pool.query<{ college_subject_id: string }>(
    `SELECT college_subject_id::text
     FROM college_room_definitions
     WHERE owner_user_id = $1 AND room_name_key = ANY($2::text[])
     GROUP BY college_subject_id
     HAVING COUNT(DISTINCT room_name_key) = $3::int
     ORDER BY college_subject_id::bigint ASC
     LIMIT 1`,
    [ownerUserId, keys, keys.length]
  );
  const cid = q.rows[0]?.college_subject_id?.trim();
  if (!cid || !/^\d+$/.test(cid)) {
    return {
      ok: false,
      message:
        "المادة مشتركة على مستوى الكلية ولا يوجد قسم/فرع واحد يضم جميع القاعات المختارة في «تعريف القاعات». عرّف القاعات في فرع واحد أو اختر قسمًا محددًا من الحقل أعلاه.",
    };
  }
  return { ok: true, collegeSubjectId: cid };
}

/** للحساب المركزي والتشكيل: «كل الكلية» — فرع من المادة إن وُجد، وإلا من القاعات المختارة (مواد مشتركة college_subject_id = NULL). */
async function resolveCollegeSubjectIdForAllBranchesExam(
  ownerUserId: string,
  studySubjectId: string,
  roomNames: string[]
): Promise<{ ok: true; collegeSubjectId: string } | { ok: false; message: string }> {
  const sid = studySubjectId.trim();
  if (!/^\d+$/.test(sid)) return { ok: false, message: "اختر المادة الدراسية أولاً ليتحدد فرعها." };
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const pool = getDbPool();
  const r = await pool.query<{ college_subject_id: string | number | null }>(
    `SELECT college_subject_id FROM college_study_subjects WHERE id = $1::bigint AND owner_user_id = $2 LIMIT 1`,
    [sid, ownerUserId]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "المادة الدراسية المختارة غير موجودة." };
  const raw = r.rows[0]?.college_subject_id;
  if (raw != null) {
    const cid = String(raw).trim();
    if (!/^\d+$/.test(cid)) return { ok: false, message: "تعذر استنتاج الفرع من المادة المختارة." };
    return { ok: true, collegeSubjectId: cid };
  }
  return inferCollegeSubjectIdFromRoomDefinitionsBulk(ownerUserId, roomNames);
}

export type CollegeRoomsActionState = { ok: true; message: string } | { ok: false; message: string } | null;
export type CollegeRoomDefinitionsActionState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

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

const MAX_ROOMS_BULK = 80;

type RoomWithStaffPayload = {
  roomName: string;
  supervisorName: string;
  invigilators: string;
  /** عند الإضافة الجماعية — سعة هذه القاعة (الامتحان الأول) */
  capacityMorning?: string;
  capacityEvening?: string;
  /** عند امتحانين — سعة الامتحان الثاني لهذه القاعة */
  capacityMorning2?: string;
  capacityEvening2?: string;
};

/** JSON من العميل: قاعة + مشرف + مراقبون (+ سعة اختيارية لكل صف) */
function parseRoomsWithStaffJson(raw: string): RoomWithStaffPayload[] | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(s) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const out: RoomWithStaffPayload[] = [];
    const seen = new Set<string>();
    for (const x of parsed) {
      if (!x || typeof x !== "object") return null;
      const normalized = normalizeCollegeRoomDefinitionName(String((x as { roomName?: string }).roomName ?? ""));
      if (!normalized) return null;
      if (seen.has(normalized.roomNameKey)) continue;
      seen.add(normalized.roomNameKey);
      const cap = (k: string) => {
        const v = (x as Record<string, unknown>)[k];
        return typeof v === "string" || typeof v === "number" ? String(v).trim() : undefined;
      };
      out.push({
        roomName: normalized.roomName,
        supervisorName: String((x as { supervisorName?: string }).supervisorName ?? "").trim(),
        invigilators: String((x as { invigilators?: string }).invigilators ?? "").trim(),
        capacityMorning: cap("capacityMorning"),
        capacityEvening: cap("capacityEvening"),
        capacityMorning2: cap("capacityMorning2"),
        capacityEvening2: cap("capacityEvening2"),
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** سطر لكل قاعة؛ إزالة التكرار مع الحفاظ على الترتيب */
function parseBulkRoomNames(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/u)) {
    const normalized = normalizeCollegeRoomDefinitionName(line);
    if (!normalized) continue;
    if (seen.has(normalized.roomNameKey)) continue;
    seen.add(normalized.roomNameKey);
    out.push(normalized.roomName);
  }
  return out;
}

const ZERO_SHIFT: ShiftAttendanceSplit = { attM: 0, absM: 0, attE: 0, absE: 0, namesM: "", namesE: "" };

type SlotCapOverride = { capacityMorning: string; capacityEvening: string };

/** عند وجود حقول s1_att_m ندمج صباحي/مسائي؛ وإلا نقرأ attendance_count الكلاسيكي (مثل إضافة قاعة). */
function slot1FromForm(formData: FormData, useSplitAttendance: boolean, capOverride?: SlotCapOverride) {
  const cmRaw = capOverride?.capacityMorning ?? fdStr(formData, "capacity_morning");
  const ceRaw = capOverride?.capacityEvening ?? fdStr(formData, "capacity_evening");
  if (!useSplitAttendance) {
    const capM = toIntStr(cmRaw);
    const capE = toIntStr(ceRaw);
    const ac = toIntStr(fdStr(formData, "attendance_count"));
    const ab = toIntStr(fdStr(formData, "absence_count"));
    const names = fdStr(formData, "absence_names");
    return {
      capacityEvening: ceRaw,
      attendanceCount: fdStr(formData, "attendance_count"),
      absenceCount: fdStr(formData, "absence_count"),
      absenceNames: names,
      shiftSplit: inferredShiftFromTotals(capM, capE, ac, ab, names),
    };
  }
  const capE = toIntStr(ceRaw);
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
    capacityEvening: ceRaw || "0",
    attendanceCount: String(attM + attE),
    absenceCount: String(absM + absE),
    absenceNames: mergeAbsenceNames(namesM, namesE),
    shiftSplit,
  };
}

function slot2FromForm(
  formData: FormData,
  useSplitAttendance: boolean,
  hasSecondExam: boolean,
  capOverride?: SlotCapOverride
) {
  if (!hasSecondExam) {
    return {
      capacityEvening: "0",
      attendanceCount: fdStr(formData, "attendance_count_2") || "0",
      absenceCount: fdStr(formData, "absence_count_2") || "0",
      absenceNames: fdStr(formData, "absence_names_2"),
      shiftSplit: ZERO_SHIFT,
    };
  }
  const cm2Raw = capOverride?.capacityMorning ?? fdStr(formData, "capacity_morning_2");
  const ce2Raw = capOverride?.capacityEvening ?? fdStr(formData, "capacity_evening_2");
  if (!useSplitAttendance) {
    const capM = toIntStr(cm2Raw);
    const capE = toIntStr(ce2Raw);
    const ac = toIntStr(fdStr(formData, "attendance_count_2"));
    const ab = toIntStr(fdStr(formData, "absence_count_2"));
    const names = fdStr(formData, "absence_names_2");
    return {
      capacityEvening: ce2Raw,
      attendanceCount: fdStr(formData, "attendance_count_2"),
      absenceCount: fdStr(formData, "absence_count_2"),
      absenceNames: names,
      shiftSplit: inferredShiftFromTotals(capM, capE, ac, ab, names),
    };
  }
  const cap2Raw = ce2Raw;
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

export async function defineCollegeRoomDefinitionsAction(
  _prev: CollegeRoomDefinitionsActionState,
  formData: FormData
): Promise<CollegeRoomDefinitionsActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح لك بهذه العملية." };
  const rawCollegeSubjectId = fdStr(formData, "college_subject_id").trim();
  const roomNamesBulk = fdStr(formData, "room_names_bulk");

  /** «كل الكلية»: حساب التشكيل/المركزي فقط — ننسخ نفس التعريفات على كل فرع. */
  const isAllBranches =
    rawCollegeSubjectId === COLLEGE_BRANCH_ALL_SENTINEL &&
    session.college_account_kind !== "DEPARTMENT";

  if (isAllBranches) {
    const branches = await listCollegeSubjectsByOwner(ownerUserId);
    if (branches.length === 0) {
      return { ok: false, message: "لا توجد أقسام أو فروع معرّفة لهذا التشكيل بعد." };
    }
    let totalAdded = 0;
    let totalExisting = 0;
    let lastIgnored = 0;
    let lastDuplicate = 0;
    let lastNames: string[] = [];
    let firstError: string | null = null;
    for (const branch of branches) {
      const r = await createCollegeRoomDefinitions({
        ownerUserId,
        collegeSubjectId: branch.id,
        roomNamesBulk,
      });
      if (!r.ok) {
        firstError = firstError ?? r.message;
        continue;
      }
      totalAdded += r.addedCount;
      totalExisting += r.existingCount;
      lastIgnored = r.ignoredCount;
      lastDuplicate = r.duplicateInputCount;
      lastNames = r.roomNames;
    }
    if (totalAdded === 0 && firstError) return { ok: false, message: firstError };
    if (totalAdded > 0) {
      const preview = lastNames.slice(0, 6).join("، ");
      const more = lastNames.length > 6 ? ` … (+${lastNames.length - 6})` : "";
      void recordCollegeActivityEvent({
        ownerUserId,
        action: "create",
        resource: "room_definition",
        summary: `تعريف ${totalAdded} سجل قاعة موزَّعة على ${branches.length} قسم/فرع: ${preview}${more}.`,
      });
    }
    revalidateCollegePortalSegment("rooms-management");
    const notes: string[] = [];
    if (totalExisting > 0) notes.push(`${totalExisting} موجودة سابقًا في بعض الفروع`);
    if (lastDuplicate > 0) notes.push(`${lastDuplicate} مكررة داخل الإدخال`);
    if (lastIgnored > 0) notes.push(`${lastIgnored} أسطر غير صالحة`);
    const lead =
      totalAdded > 0
        ? `تمت إضافة ${totalAdded} سجل قاعة موزَّعة على ${branches.length} قسم/فرع`
        : "لم تُضف قاعات جديدة لأن جميع الأسماء كانت معرّفة مسبقًا في كل الفروع";
    return {
      ok: true,
      message: notes.length > 0 ? `${lead}، مع تجاهل ${notes.join("، ")}.` : lead + ".",
    };
  }

  const collegeSubjectId = effectiveCollegeSubjectIdForMutation(session, rawCollegeSubjectId);
  const result = await createCollegeRoomDefinitions({
    ownerUserId,
    collegeSubjectId,
    roomNamesBulk,
  });
  if (!result.ok) return result;
  if (result.addedCount > 0) {
    const preview = result.roomNames.slice(0, 6).join("، ");
    const more = result.roomNames.length > 6 ? ` … (+${result.roomNames.length - 6})` : "";
    void recordCollegeActivityEvent({
      ownerUserId,
      action: "create",
      resource: "room_definition",
      summary: `تعريف ${result.addedCount} قاعة في السجل المرجعي: ${preview}${more}.`,
    });
  }
  revalidateCollegePortalSegment("rooms-management");
  const notes: string[] = [];
  if (result.existingCount > 0) notes.push(`${result.existingCount} موجودة سابقًا`);
  if (result.duplicateInputCount > 0) notes.push(`${result.duplicateInputCount} مكررة داخل الإدخال`);
  if (result.ignoredCount > 0) notes.push(`${result.ignoredCount} أسطر غير صالحة`);
  const lead =
    result.addedCount > 0 ? `تمت إضافة ${result.addedCount} قاعة جديدة` : "لم تُضف قاعات جديدة لأن جميع الأسماء كانت معرّفة مسبقًا";
  return {
    ok: true,
    message: notes.length > 0 ? `${lead}، مع تجاهل ${notes.join("، ")}.` : lead + ".",
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
  const fromJson = parseRoomsWithStaffJson(fdStr(formData, "rooms_with_staff_json"));
  const bulkRaw = fdStr(formData, "room_names_bulk").trim();
  const singleRoom = fdStr(formData, "room_name").trim();
  const sharedSupervisor = fdStr(formData, "supervisor_name");
  const sharedInvigilators = fdStr(formData, "invigilators");

  let roomEntries: RoomWithStaffPayload[];
  if (fromJson && fromJson.length > 0) {
    roomEntries = fromJson;
  } else {
    const roomNames = bulkRaw ? parseBulkRoomNames(bulkRaw) : singleRoom.length >= 2 ? [singleRoom] : [];
    roomEntries = roomNames.map((roomName) => ({
      roomName,
      supervisorName: sharedSupervisor.trim(),
      invigilators: sharedInvigilators.trim(),
    }));
  }

  if (roomEntries.length === 0) {
    return {
      ok: false,
      message:
        "أدخل اسم قاعة واحد على الأقل (حرفان فأكثر) في قائمة أسماء القاعات، ثم املأ مشرفاً ومراقبين لكل قاعة إن رغبت.",
    };
  }
  if (roomEntries.length > MAX_ROOMS_BULK) {
    return { ok: false, message: `يمكن إضافة ${MAX_ROOMS_BULK} قاعة كحد أقصى في عملية واحدة.` };
  }
  const useSplitAttendance = formData.has("s1_att_m");
  const hasSecondExam = fdStr(formData, "study_subject_id_2").trim() !== "";
  const rawCollegeSubjectIdForRoom = fdStr(formData, "college_subject_id").trim();
  let collegeSubjectId: string;
  const allBranchesMode =
    rawCollegeSubjectIdForRoom === COLLEGE_BRANCH_ALL_SENTINEL &&
    session.college_account_kind !== "DEPARTMENT";
  if (allBranchesMode) {
    const resolved = await resolveCollegeSubjectIdForAllBranchesExam(
      ownerUserId,
      fdStr(formData, "study_subject_id"),
      roomEntries.map((e) => e.roomName)
    );
    if (!resolved.ok) return { ok: false, message: resolved.message };
    collegeSubjectId = resolved.collegeSubjectId;
    /** نضمن وجود تعريف للقاعة في الفرع المستنتج (المستخدم قد اختارها من قاعة معرّفة في فرع آخر فقط). */
    const namesBulkForDefs = roomEntries.map((e) => e.roomName).join("\n");
    await createCollegeRoomDefinitions({
      ownerUserId,
      collegeSubjectId,
      roomNamesBulk: namesBulkForDefs,
    });
  } else {
    collegeSubjectId = effectiveCollegeSubjectIdForMutation(session, rawCollegeSubjectIdForRoom);
  }

  const sharedBase = {
    ownerUserId,
    collegeSubjectId,
    studySubjectId: fdStr(formData, "study_subject_id"),
    studySubjectId2: fdStr(formData, "study_subject_id_2"),
    stageLevel: fdStr(formData, "stage_level"),
    stageLevel2: fdStr(formData, "stage_level_2"),
    externalRoomStaffJson: fdStr(formData, "external_room_staff_json"),
  };

  let created = 0;
  let lastErr: string | null = null;
  for (const entry of roomEntries) {
    const cap1Ov: SlotCapOverride | undefined = fromJson
      ? {
          capacityMorning: entry.capacityMorning ?? fdStr(formData, "capacity_morning"),
          capacityEvening: entry.capacityEvening ?? fdStr(formData, "capacity_evening"),
        }
      : undefined;
    const cap2Ov: SlotCapOverride | undefined =
      fromJson && hasSecondExam
        ? {
            capacityMorning: entry.capacityMorning2 ?? fdStr(formData, "capacity_morning_2"),
            capacityEvening: entry.capacityEvening2 ?? fdStr(formData, "capacity_evening_2"),
          }
        : undefined;

    const s1 = slot1FromForm(formData, useSplitAttendance, cap1Ov);
    const s2 = slot2FromForm(formData, useSplitAttendance, hasSecondExam, cap2Ov);

    const capacityMorning = fromJson
      ? (entry.capacityMorning ?? fdStr(formData, "capacity_morning"))
      : fdStr(formData, "capacity_morning");
    const capacityMorning2 = hasSecondExam
      ? fromJson
        ? (entry.capacityMorning2 ?? fdStr(formData, "capacity_morning_2"))
        : fdStr(formData, "capacity_morning_2")
      : "0";

    const result = await createCollegeExamRoom({
      ...sharedBase,
      capacityMorning,
      capacityEvening: s1.capacityEvening,
      capacityMorning2,
      capacityEvening2: hasSecondExam ? s2.capacityEvening : "0",
      attendanceCount: s1.attendanceCount,
      absenceCount: s1.absenceCount,
      absenceNames: s1.absenceNames,
      attendanceCount2: s2.attendanceCount,
      absenceCount2: s2.absenceCount,
      absenceNames2: s2.absenceNames,
      shift1Attendance: s1.shiftSplit,
      shift2Attendance: s2.shiftSplit,
      roomName: entry.roomName,
      supervisorName: entry.supervisorName,
      invigilators: entry.invigilators,
      serialNo: "",
    });
    if (!result.ok) {
      lastErr = result.message;
      break;
    }
    created += 1;
  }
  if (lastErr) {
    if (created > 0) revalidateCollegePortalSegment("rooms-management");
    if (created === 0) return { ok: false, message: lastErr };
    return {
      ok: false,
      message: `تم إنشاء ${created} قاعة ثم توقف الحفظ: ${lastErr}`,
    };
  }
  const roomNames = roomEntries.map((e) => e.roomName);
  if (roomNames.length === 1) {
    void recordCollegeActivityEvent({
      ownerUserId,
      action: "create",
      resource: "exam_room",
      summary: `إضافة قاعة امتحانية: ${roomNames[0]}.`,
    });
  } else {
    const preview = roomNames.slice(0, 5).join("، ");
    const more = roomNames.length > 5 ? ` … (+${roomNames.length - 5})` : "";
    void recordCollegeActivityEvent({
      ownerUserId,
      action: "create",
      resource: "exam_room",
      summary: `إضافة ${roomNames.length} قاعة امتحانية دفعة واحدة: ${preview}${more}.`,
    });
  }
  revalidateCollegePortalSegment("rooms-management");
  return {
    ok: true,
    message: roomNames.length === 1 ? "تمت إضافة القاعة بنجاح." : `تمت إضافة ${roomNames.length} قاعة بنجاح.`,
  };
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
  const rawCollegeSubjectIdForUpdate = fdStr(formData, "college_subject_id").trim();
  let resolvedCollegeSubjectIdForUpdate: string;
  if (
    rawCollegeSubjectIdForUpdate === COLLEGE_BRANCH_ALL_SENTINEL &&
    session.college_account_kind !== "DEPARTMENT"
  ) {
    const resolved = await resolveCollegeSubjectIdForAllBranchesExam(
      ownerUserId,
      fdStr(formData, "study_subject_id"),
      [fdStr(formData, "room_name")]
    );
    if (!resolved.ok) return { ok: false, message: resolved.message };
    resolvedCollegeSubjectIdForUpdate = resolved.collegeSubjectId;
  } else {
    resolvedCollegeSubjectIdForUpdate = effectiveCollegeSubjectIdForMutation(session, rawCollegeSubjectIdForUpdate);
  }
  const result = await updateCollegeExamRoom({
    id,
    ownerUserId,
    collegeSubjectId: resolvedCollegeSubjectIdForUpdate,
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
