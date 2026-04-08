import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import {
  parseExternalRoomStaffFromDb,
  parseExternalRoomStaffFromFormJson,
  serializeExternalRoomStaffForDb,
  validateExternalRoomStaffForSave,
  type ExternalRoomStaffStored,
} from "@/lib/room-external-staff";
import { ensureCoreSchema } from "@/lib/schema";

export type { ExternalRoomStaffStored } from "@/lib/room-external-staff";

/** حضور/غياب مفصول حسب الدوام الصباحي والمسائي لامتحان واحد في القاعة */
export type ShiftAttendanceSplit = {
  attM: number;
  absM: number;
  attE: number;
  absE: number;
  namesM: string;
  namesE: string;
};

export function mergeShiftAbsenceNames(morning: string, evening: string): string {
  const m = morning.trim();
  const e = evening.trim();
  if (!e) return m;
  if (!m) return e;
  return `${m}\n--- دوام مسائي ---\n${e}`;
}

export type CollegeExamRoomRow = {
  id: string;
  owner_user_id: string;
  study_subject_id: string;
  study_subject_name: string;
  /** من college_study_subjects.instructor_name للمادة الأولى */
  study_subject_instructor_name: string;
  /** مادة امتحانية ثانية في نفس القاعة ونفس نافذة الزمن (عند الجدولة). */
  study_subject_id_2: string | null;
  study_subject_name_2: string | null;
  study_subject_instructor_name_2: string | null;
  serial_no: number;
  room_name: string;
  supervisor_name: string;
  invigilators: string;
  supervisor_name_2: string | null;
  invigilators_2: string | null;
  capacity_morning: number;
  capacity_evening: number;
  capacity_total: number;
  capacity_morning_2: number;
  capacity_evening_2: number;
  capacity_total_2: number;
  attendance_count: number;
  absence_count: number;
  absence_names: string;
  attendance_morning: number;
  absence_morning: number;
  attendance_evening: number;
  absence_evening: number;
  absence_names_morning: string;
  absence_names_evening: string;
  attendance_count_2: number;
  absence_count_2: number;
  absence_names_2: string;
  attendance_morning_2: number;
  absence_morning_2: number;
  attendance_evening_2: number;
  absence_evening_2: number;
  absence_names_morning_2: string;
  absence_names_evening_2: string;
  /** المرحلة الدراسية المرتبطة بالامتحان الأول في القاعة */
  stage_level: number;
  /** المرحلة للامتحان الثاني عند وجوده */
  stage_level_2: number | null;
  /** مشرف/مراقبون من خارج تشكيل الكلية (من JSONB) */
  external_room_staff: ExternalRoomStaffStored;
  created_at: Date;
  updated_at: Date;
};

function toInt(v: string, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
}

const MAX_INVIGILATORS = 4;

function invigilatorNamesFromRaw(raw: string): string[] {
  return raw
    .split(/[,،;|\n\r]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseRequiredStageLevel(raw: string): { ok: true; v: number } | { ok: false; message: string } {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 13) {
    return { ok: false, message: "يرجى اختيار المرحلة الدراسية للامتحان الأول." };
  }
  return { ok: true, v: n };
}

function parseSecondStageLevel(
  raw: string,
  id2: string | null
): { ok: true; v: number | null } | { ok: false; message: string } {
  if (!id2) return { ok: true, v: null };
  const n = Number(String(raw ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 13) {
    return { ok: false, message: "يرجى اختيار المرحلة الدراسية للامتحان الثاني." };
  }
  return { ok: true, v: n };
}

function normalizeInvigilators(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const names = invigilatorNamesFromRaw(raw);
  if (names.length > MAX_INVIGILATORS) {
    return {
      ok: false,
      message: "المراقبون: أربعة أسماء كحد أقصى. افصل بين الأسماء بفاصلة.",
    };
  }
  return { ok: true, value: names.join("، ") };
}

/** إذا كانت كل القاعات محفوظة بتسلسل 0 (إضافة بدون رقم)، نعيد ترقيمها 1..n حسب تاريخ الإنشاء. */
async function repairAllZeroSerialsForOwner(pool: ReturnType<typeof getDbPool>, ownerUserId: string) {
  const stat = await pool.query<{ c: number; mx: number }>(
    `SELECT COUNT(*)::int AS c, COALESCE(MAX(serial_no), 0)::int AS mx
     FROM college_exam_rooms WHERE owner_user_id = $1`,
    [ownerUserId]
  );
  const row = stat.rows[0];
  if (!row || row.c === 0 || row.mx !== 0) return;
  await pool.query(
    `WITH o AS (
       SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
       FROM college_exam_rooms WHERE owner_user_id = $1
     )
     UPDATE college_exam_rooms c
     SET serial_no = o.rn, updated_at = NOW()
     FROM o
     WHERE c.id = o.id AND c.owner_user_id = $1`,
    [ownerUserId]
  );
}

export async function listCollegeExamRoomsByOwner(
  ownerUserId: string,
  restrictCollegeSubjectId?: string | null
): Promise<CollegeExamRoomRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  await repairAllZeroSerialsForOwner(pool, ownerUserId);
  const rid = restrictCollegeSubjectId?.trim();
  const r = await pool.query<{
    id: string | number;
    owner_user_id: string | number;
    study_subject_id: string | number;
    study_subject_name: string;
    study_subject_instructor_name: string | null;
    study_subject_id_2: string | number | null;
    study_subject_name_2: string | null;
    study_subject_instructor_name_2: string | null;
    serial_no: number;
    room_name: string;
    supervisor_name: string;
    invigilators: string | null;
    supervisor_name_2: string | null;
    invigilators_2: string | null;
    capacity_morning: number;
    capacity_evening: number;
    capacity_total: number;
    capacity_morning_2: number;
    capacity_evening_2: number;
    capacity_total_2: number;
    attendance_count: number;
    absence_count: number;
    absence_names: string | null;
    attendance_morning: number;
    absence_morning: number;
    attendance_evening: number;
    absence_evening: number;
    absence_names_morning: string | null;
    absence_names_evening: string | null;
    attendance_count_2: number;
    absence_count_2: number;
    absence_names_2: string | null;
    attendance_morning_2: number;
    absence_morning_2: number;
    attendance_evening_2: number;
    absence_evening_2: number;
    absence_names_morning_2: string | null;
    absence_names_evening_2: string | null;
    stage_level: number;
    stage_level_2: number | null;
    external_room_staff: unknown | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT r.id, r.owner_user_id, r.study_subject_id,
            s.subject_name AS study_subject_name,
            TRIM(COALESCE(s.instructor_name::text, '')) AS study_subject_instructor_name,
            r.study_subject_id_2,
            s2.subject_name AS study_subject_name_2,
            TRIM(COALESCE(s2.instructor_name::text, '')) AS study_subject_instructor_name_2,
            r.serial_no, r.room_name, r.supervisor_name,
            r.invigilators,
            r.supervisor_name_2, r.invigilators_2,
            r.external_room_staff,
            r.stage_level, r.stage_level_2,
            r.capacity_morning, r.capacity_evening, r.capacity_total,
            r.capacity_morning_2, r.capacity_evening_2, r.capacity_total_2,
            r.attendance_count, r.absence_count, r.absence_names,
            r.attendance_morning, r.absence_morning, r.attendance_evening, r.absence_evening,
            r.absence_names_morning, r.absence_names_evening,
            r.attendance_count_2, r.absence_count_2, r.absence_names_2,
            r.attendance_morning_2, r.absence_morning_2, r.attendance_evening_2, r.absence_evening_2,
            r.absence_names_morning_2, r.absence_names_evening_2,
            r.created_at, r.updated_at
     FROM college_exam_rooms r
     INNER JOIN college_study_subjects s
       ON s.id = r.study_subject_id AND s.owner_user_id = r.owner_user_id
     LEFT JOIN college_study_subjects s2
       ON s2.id = r.study_subject_id_2 AND s2.owner_user_id = r.owner_user_id
     WHERE r.owner_user_id = $1
       ${rid ? `AND (s.college_subject_id = $2::bigint OR (s2.id IS NOT NULL AND s2.college_subject_id = $2::bigint))` : ""}
     ORDER BY r.serial_no ASC, r.created_at DESC`,
    rid ? [ownerUserId, rid] : [ownerUserId]
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    owner_user_id: String(row.owner_user_id),
    study_subject_id: String(row.study_subject_id),
    study_subject_name: row.study_subject_name,
    study_subject_instructor_name: String(row.study_subject_instructor_name ?? "").trim(),
    study_subject_id_2: row.study_subject_id_2 != null ? String(row.study_subject_id_2) : null,
    study_subject_name_2: row.study_subject_name_2 ?? null,
    study_subject_instructor_name_2:
      row.study_subject_id_2 != null ? String(row.study_subject_instructor_name_2 ?? "").trim() : null,
    serial_no: row.serial_no,
    room_name: row.room_name,
    supervisor_name: row.supervisor_name,
    invigilators: row.invigilators ?? "",
    supervisor_name_2: row.supervisor_name_2 ?? null,
    invigilators_2: row.invigilators_2 ?? null,
    capacity_morning: Number(row.capacity_morning ?? 0),
    capacity_evening: Number(row.capacity_evening ?? 0),
    capacity_total: Number(row.capacity_total ?? 0),
    capacity_morning_2: Number(row.capacity_morning_2 ?? 0),
    capacity_evening_2: Number(row.capacity_evening_2 ?? 0),
    capacity_total_2: Number(row.capacity_total_2 ?? 0),
    attendance_count: row.attendance_count,
    absence_count: row.absence_count,
    absence_names: row.absence_names ?? "",
    attendance_morning: Number(row.attendance_morning ?? 0),
    absence_morning: Number(row.absence_morning ?? 0),
    attendance_evening: Number(row.attendance_evening ?? 0),
    absence_evening: Number(row.absence_evening ?? 0),
    absence_names_morning: row.absence_names_morning ?? "",
    absence_names_evening: row.absence_names_evening ?? "",
    attendance_count_2: Number(row.attendance_count_2 ?? 0),
    absence_count_2: Number(row.absence_count_2 ?? 0),
    absence_names_2: row.absence_names_2 ?? "",
    attendance_morning_2: Number(row.attendance_morning_2 ?? 0),
    absence_morning_2: Number(row.absence_morning_2 ?? 0),
    attendance_evening_2: Number(row.attendance_evening_2 ?? 0),
    absence_evening_2: Number(row.absence_evening_2 ?? 0),
    absence_names_morning_2: row.absence_names_morning_2 ?? "",
    absence_names_evening_2: row.absence_names_evening_2 ?? "",
    stage_level: Number(row.stage_level ?? 1),
    stage_level_2: row.stage_level_2 != null ? Number(row.stage_level_2) : null,
    external_room_staff: parseExternalRoomStaffFromDb(row.external_room_staff),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

/** صف قاعة مع تسمية التشكيل/الكلية لعرض المدير لجميع الحسابات */
export type AdminCollegeExamRoomRow = CollegeExamRoomRow & {
  formation_label: string;
  owner_username: string;
};

/**
 * كل قاعات الامتحانات المعرّفة من حسابات الكلية (تشكيلات ومتابعة) — نفس منطق القائمة في «إدارة القاعات» لكل مالك.
 */
export async function listAllCollegeExamRoomsForAdmin(): Promise<AdminCollegeExamRoomRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string | number;
    owner_user_id: string | number;
    study_subject_id: string | number;
    study_subject_name: string;
    study_subject_instructor_name: string | null;
    study_subject_id_2: string | number | null;
    study_subject_name_2: string | null;
    study_subject_instructor_name_2: string | null;
    serial_no: number;
    room_name: string;
    supervisor_name: string;
    invigilators: string | null;
    supervisor_name_2: string | null;
    invigilators_2: string | null;
    capacity_morning: number;
    capacity_evening: number;
    capacity_total: number;
    capacity_morning_2: number;
    capacity_evening_2: number;
    capacity_total_2: number;
    attendance_count: number;
    absence_count: number;
    absence_names: string | null;
    attendance_morning: number;
    absence_morning: number;
    attendance_evening: number;
    absence_evening: number;
    absence_names_morning: string | null;
    absence_names_evening: string | null;
    attendance_count_2: number;
    absence_count_2: number;
    absence_names_2: string | null;
    attendance_morning_2: number;
    absence_morning_2: number;
    attendance_evening_2: number;
    absence_evening_2: number;
    absence_names_morning_2: string | null;
    absence_names_evening_2: string | null;
    stage_level: number;
    stage_level_2: number | null;
    external_room_staff: unknown | null;
    created_at: Date;
    updated_at: Date;
    formation_label: string;
    owner_username: string;
  }>(
    `SELECT r.id, r.owner_user_id, r.study_subject_id,
            s.subject_name AS study_subject_name,
            TRIM(COALESCE(s.instructor_name::text, '')) AS study_subject_instructor_name,
            r.study_subject_id_2,
            s2.subject_name AS study_subject_name_2,
            TRIM(COALESCE(s2.instructor_name::text, '')) AS study_subject_instructor_name_2,
            r.serial_no, r.room_name, r.supervisor_name,
            r.invigilators,
            r.supervisor_name_2, r.invigilators_2,
            r.external_room_staff,
            r.stage_level, r.stage_level_2,
            r.capacity_morning, r.capacity_evening, r.capacity_total,
            r.capacity_morning_2, r.capacity_evening_2, r.capacity_total_2,
            r.attendance_count, r.absence_count, r.absence_names,
            r.attendance_morning, r.absence_morning, r.attendance_evening, r.absence_evening,
            r.absence_names_morning, r.absence_names_evening,
            r.attendance_count_2, r.absence_count_2, r.absence_names_2,
            r.attendance_morning_2, r.absence_morning_2, r.attendance_evening_2, r.absence_evening_2,
            r.absence_names_morning_2, r.absence_names_evening_2,
            r.created_at, r.updated_at,
            COALESCE(
              NULLIF(TRIM(
                CASE
                  WHEN UPPER(COALESCE(p.account_kind::text, 'FORMATION')) = 'FOLLOWUP'
                    THEN COALESCE(p.holder_name, '')
                  ELSE COALESCE(p.formation_name, '')
                END
              ), ''),
              u.username::text
            ) AS formation_label,
            u.username::text AS owner_username
     FROM college_exam_rooms r
     INNER JOIN college_study_subjects s
       ON s.id = r.study_subject_id AND s.owner_user_id = r.owner_user_id
     LEFT JOIN college_study_subjects s2
       ON s2.id = r.study_subject_id_2 AND s2.owner_user_id = r.owner_user_id
     INNER JOIN users u
       ON u.id = r.owner_user_id AND u.role = 'COLLEGE' AND u.deleted_at IS NULL
     LEFT JOIN college_account_profiles p ON p.user_id = u.id
     ORDER BY formation_label ASC, u.username ASC, r.serial_no ASC, r.created_at DESC`
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    owner_user_id: String(row.owner_user_id),
    study_subject_id: String(row.study_subject_id),
    study_subject_name: row.study_subject_name,
    study_subject_instructor_name: String(row.study_subject_instructor_name ?? "").trim(),
    study_subject_id_2: row.study_subject_id_2 != null ? String(row.study_subject_id_2) : null,
    study_subject_name_2: row.study_subject_name_2 ?? null,
    study_subject_instructor_name_2:
      row.study_subject_id_2 != null ? String(row.study_subject_instructor_name_2 ?? "").trim() : null,
    serial_no: row.serial_no,
    room_name: row.room_name,
    supervisor_name: row.supervisor_name,
    invigilators: row.invigilators ?? "",
    supervisor_name_2: row.supervisor_name_2 ?? null,
    invigilators_2: row.invigilators_2 ?? null,
    capacity_morning: Number(row.capacity_morning ?? 0),
    capacity_evening: Number(row.capacity_evening ?? 0),
    capacity_total: Number(row.capacity_total ?? 0),
    capacity_morning_2: Number(row.capacity_morning_2 ?? 0),
    capacity_evening_2: Number(row.capacity_evening_2 ?? 0),
    capacity_total_2: Number(row.capacity_total_2 ?? 0),
    attendance_count: Number(row.attendance_count ?? 0),
    absence_count: Number(row.absence_count ?? 0),
    absence_names: row.absence_names ?? "",
    attendance_morning: Number(row.attendance_morning ?? 0),
    absence_morning: Number(row.absence_morning ?? 0),
    attendance_evening: Number(row.attendance_evening ?? 0),
    absence_evening: Number(row.absence_evening ?? 0),
    absence_names_morning: row.absence_names_morning ?? "",
    absence_names_evening: row.absence_names_evening ?? "",
    attendance_count_2: Number(row.attendance_count_2 ?? 0),
    absence_count_2: Number(row.absence_count_2 ?? 0),
    absence_names_2: row.absence_names_2 ?? "",
    attendance_morning_2: Number(row.attendance_morning_2 ?? 0),
    absence_morning_2: Number(row.absence_morning_2 ?? 0),
    attendance_evening_2: Number(row.attendance_evening_2 ?? 0),
    absence_evening_2: Number(row.absence_evening_2 ?? 0),
    absence_names_morning_2: row.absence_names_morning_2 ?? "",
    absence_names_evening_2: row.absence_names_evening_2 ?? "",
    stage_level: Number(row.stage_level ?? 1),
    stage_level_2: row.stage_level_2 != null ? Number(row.stage_level_2) : null,
    external_room_staff: parseExternalRoomStaffFromDb(row.external_room_staff),
    created_at: row.created_at,
    updated_at: row.updated_at,
    formation_label: row.formation_label?.trim() || row.owner_username || "—",
    owner_username: row.owner_username ?? "",
  }));
}

export type CreateCollegeExamRoomInput = {
  ownerUserId: string;
  studySubjectId: string;
  studySubjectId2: string;
  serialNo?: string;
  roomName: string;
  supervisorName: string;
  invigilators: string;
  capacityMorning: string;
  capacityEvening: string;
  capacityMorning2: string;
  capacityEvening2: string;
  attendanceCount: string;
  absenceCount: string;
  absenceNames: string;
  attendanceCount2: string;
  absenceCount2: string;
  absenceNames2: string;
  stageLevel: string;
  stageLevel2: string;
  /** عند الحفظ من نموذج يفصل الصباحي/المسائي */
  shift1Attendance?: ShiftAttendanceSplit;
  shift2Attendance?: ShiftAttendanceSplit;
  /** JSON من الحقل المخفي في نموذج إدارة القاعات */
  externalRoomStaffJson?: string;
};

export function inferredShiftFromTotals(
  capM: number,
  capE: number,
  attendance: number,
  absence: number,
  names: string
): ShiftAttendanceSplit {
  const cM = Math.max(0, Math.floor(capM));
  const cE = Math.max(0, Math.floor(capE));
  if (cM > 0 && cE <= 0) {
    return { attM: attendance, absM: absence, attE: 0, absE: 0, namesM: names, namesE: "" };
  }
  if (cM <= 0 && cE > 0) {
    return { attM: 0, absM: 0, attE: attendance, absE: absence, namesM: "", namesE: names };
  }
  return { attM: attendance, absM: absence, attE: 0, absE: 0, namesM: names, namesE: "" };
}

function buildSlotPayload(input: CreateCollegeExamRoomInput): {
  capM: number;
  capE: number;
  capT: number;
  capM2: number;
  capE2: number;
  capT2: number;
  id2: string | null;
  sup2: string | null;
  inv2: string;
  att2: number;
  abs2: number;
  absNames2: string;
  inv2Norm: ReturnType<typeof normalizeInvigilators>;
} {
  const capM = toInt(input.capacityMorning);
  const capE = toInt(input.capacityEvening);
  const capT = capM + capE;
  const id2Raw = String(input.studySubjectId2 ?? "").trim();
  const id2 = /^\d+$/.test(id2Raw) ? id2Raw : null;
  const capM2 = id2 ? toInt(input.capacityMorning2) : 0;
  const capE2 = id2 ? toInt(input.capacityEvening2) : 0;
  const capT2 = capM2 + capE2;
  /** مشرف ومراقبون واحد للقاعة؛ عند وجود امتحان ثانٍ يُنسَخان إلى الحقول الثانية في التخزين */
  const supPrimary = String(input.supervisorName ?? "").trim();
  const invPrimaryRaw = String(input.invigilators ?? "");
  const inv2Norm = id2 ? normalizeInvigilators(invPrimaryRaw) : ({ ok: true, value: "" } as const);
  const att2 = id2 ? toInt(input.attendanceCount2) : 0;
  const abs2 = id2 ? toInt(input.absenceCount2) : 0;
  const absNames2 = id2 ? String(input.absenceNames2 ?? "").trim() : "";
  return {
    capM,
    capE,
    capT,
    capM2,
    capE2,
    capT2,
    id2,
    sup2: id2 ? (supPrimary.length > 0 ? supPrimary : null) : null,
    inv2: id2 && inv2Norm.ok ? inv2Norm.value : "",
    inv2Norm,
    att2,
    abs2,
    absNames2,
  };
}

export async function createCollegeExamRoom(
  input: CreateCollegeExamRoomInput
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  const serialInput = String(input.serialNo ?? "").trim();
  let serialNo = toInt(serialInput, -1);
  const roomName = input.roomName.trim();
  const supervisorName = input.supervisorName.trim();
  const slot = buildSlotPayload(input);
  if (slot.id2 && !slot.inv2Norm.ok) return slot.inv2Norm;

  const attendanceCount = toInt(input.attendanceCount);
  const absenceCount = toInt(input.absenceCount);

  if (!/^\d+$/.test(input.studySubjectId.trim())) return { ok: false, message: "اختر مادة دراسية صالحة." };
  if (slot.id2 && slot.id2 === input.studySubjectId.trim()) {
    return { ok: false, message: "المادة الثانية يجب أن تختلف عن المادة الأولى." };
  }
  const pool = getDbPool();
  if (serialInput === "" || serialNo < 0) {
    const nextSerial = await pool.query<{ next_serial: number }>(
      `SELECT COALESCE(MAX(serial_no), 0) + 1 AS next_serial
       FROM college_exam_rooms
       WHERE owner_user_id = $1`,
      [input.ownerUserId]
    );
    serialNo = Number(nextSerial.rows[0]?.next_serial ?? 1);
  }
  if (roomName.length < 2) return { ok: false, message: "اسم القاعة يجب أن يكون حرفين على الأقل." };
  if (supervisorName.length < 2) return { ok: false, message: "اسم المشرف يجب أن يكون حرفين على الأقل." };
  const invigilatorsNorm = normalizeInvigilators(input.invigilators);
  if (!invigilatorsNorm.ok) return invigilatorsNorm;
  const extParsed = parseExternalRoomStaffFromFormJson(String(input.externalRoomStaffJson ?? ""));
  const extVal = validateExternalRoomStaffForSave(extParsed);
  if (!extVal.ok) return extVal;
  const externalStaffPayload = serializeExternalRoomStaffForDb(extVal.normalized);
  if (attendanceCount + absenceCount > slot.capT) {
    return { ok: false, message: "الحضور + الغياب (الامتحان الأول) لا يمكن أن يتجاوز مجموع الصباحي والمسائي." };
  }
  if (slot.id2 && slot.att2 + slot.abs2 > slot.capT2) {
    return { ok: false, message: "الحضور + الغياب (الامتحان الثاني) لا يمكن أن يتجاوز مجموع سعتيه." };
  }
  const subjectExists = await pool.query(
    `SELECT 1 FROM college_study_subjects WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
    [input.studySubjectId.trim(), input.ownerUserId]
  );
  if ((subjectExists.rowCount ?? 0) === 0) return { ok: false, message: "المادة الدراسية المختارة غير موجودة." };
  if (slot.id2) {
    const s2 = await pool.query(
      `SELECT 1 FROM college_study_subjects WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
      [slot.id2, input.ownerUserId]
    );
    if ((s2.rowCount ?? 0) === 0) return { ok: false, message: "المادة الدراسية الثانية غير موجودة." };
  }

  const sl1 = parseRequiredStageLevel(input.stageLevel);
  if (!sl1.ok) return sl1;
  const sl2 = parseSecondStageLevel(input.stageLevel2, slot.id2);
  if (!sl2.ok) return sl2;

  const shift1 =
    input.shift1Attendance ??
    inferredShiftFromTotals(slot.capM, slot.capE, attendanceCount, absenceCount, input.absenceNames.trim());
  const shift2: ShiftAttendanceSplit =
    input.shift2Attendance ??
    (slot.id2
      ? inferredShiftFromTotals(slot.capM2, slot.capE2, slot.att2, slot.abs2, slot.absNames2)
      : { attM: 0, absM: 0, attE: 0, absE: 0, namesM: "", namesE: "" });

  await pool.query(
    `INSERT INTO college_exam_rooms
      (owner_user_id, study_subject_id, study_subject_id_2, stage_level, stage_level_2, serial_no, room_name, supervisor_name, invigilators,
       supervisor_name_2, invigilators_2,
       capacity_morning, capacity_evening, capacity_total,
       capacity_morning_2, capacity_evening_2, capacity_total_2,
       attendance_count, absence_count, absence_names,
       attendance_morning, absence_morning, attendance_evening, absence_evening, absence_names_morning, absence_names_evening,
       attendance_count_2, absence_count_2, absence_names_2,
       attendance_morning_2, absence_morning_2, attendance_evening_2, absence_evening_2, absence_names_morning_2, absence_names_evening_2,
       external_room_staff, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,NOW(),NOW())`,
    [
      input.ownerUserId,
      input.studySubjectId.trim(),
      slot.id2,
      sl1.v,
      sl2.v,
      serialNo,
      roomName,
      supervisorName,
      invigilatorsNorm.value,
      slot.sup2,
      slot.id2 ? slot.inv2 : null,
      slot.capM,
      slot.capE,
      slot.capT,
      slot.capM2,
      slot.capE2,
      slot.capT2,
      attendanceCount,
      absenceCount,
      input.absenceNames.trim(),
      shift1.attM,
      shift1.absM,
      shift1.attE,
      shift1.absE,
      shift1.namesM || null,
      shift1.namesE || null,
      slot.att2,
      slot.abs2,
      slot.absNames2 || null,
      shift2.attM,
      shift2.absM,
      shift2.attE,
      shift2.absE,
      shift2.namesM || null,
      shift2.namesE || null,
      externalStaffPayload,
    ]
  );
  return { ok: true };
}

export type UpdateCollegeExamRoomInput = CreateCollegeExamRoomInput & {
  id: string;
  serialNo: string;
};

export async function updateCollegeExamRoom(
  input: UpdateCollegeExamRoomInput
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  if (!/^\d+$/.test(input.id.trim())) return { ok: false, message: "معرّف القاعة غير صالح." };
  const serialNo = toInt(input.serialNo, -1);
  const roomName = input.roomName.trim();
  const supervisorName = input.supervisorName.trim();
  if (!/^\d+$/.test(input.studySubjectId.trim())) return { ok: false, message: "اختر مادة دراسية صالحة." };
  if (serialNo < 0) return { ok: false, message: "التسلسل يجب أن يكون رقمًا صحيحًا." };
  if (roomName.length < 2) return { ok: false, message: "اسم القاعة يجب أن يكون حرفين على الأقل." };
  if (supervisorName.length < 2) return { ok: false, message: "اسم المشرف يجب أن يكون حرفين على الأقل." };
  const slot = buildSlotPayload(input);
  if (slot.id2 && !slot.inv2Norm.ok) return slot.inv2Norm;
  if (slot.id2 && slot.id2 === input.studySubjectId.trim()) {
    return { ok: false, message: "المادة الثانية يجب أن تختلف عن المادة الأولى." };
  }
  const invigilatorsNorm = normalizeInvigilators(input.invigilators);
  if (!invigilatorsNorm.ok) return invigilatorsNorm;
  const extParsedU = parseExternalRoomStaffFromFormJson(String(input.externalRoomStaffJson ?? ""));
  const extValU = validateExternalRoomStaffForSave(extParsedU);
  if (!extValU.ok) return extValU;
  const externalStaffPayloadU = serializeExternalRoomStaffForDb(extValU.normalized);
  const attendanceCount = toInt(input.attendanceCount);
  const absenceCount = toInt(input.absenceCount);
  if (attendanceCount + absenceCount > slot.capT) {
    return { ok: false, message: "الحضور + الغياب (الامتحان الأول) لا يمكن أن يتجاوز مجموع الصباحي والمسائي." };
  }
  if (slot.id2 && slot.att2 + slot.abs2 > slot.capT2) {
    return { ok: false, message: "الحضور + الغياب (الامتحان الثاني) لا يمكن أن يتجاوز مجموع سعتيه." };
  }
  const pool = getDbPool();
  const subjectExists = await pool.query(
    `SELECT 1 FROM college_study_subjects WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
    [input.studySubjectId.trim(), input.ownerUserId]
  );
  if ((subjectExists.rowCount ?? 0) === 0) return { ok: false, message: "المادة الدراسية المختارة غير موجودة." };
  if (slot.id2) {
    const s2 = await pool.query(
      `SELECT 1 FROM college_study_subjects WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
      [slot.id2, input.ownerUserId]
    );
    if ((s2.rowCount ?? 0) === 0) return { ok: false, message: "المادة الدراسية الثانية غير موجودة." };
  }

  const sl1 = parseRequiredStageLevel(input.stageLevel);
  if (!sl1.ok) return sl1;
  const sl2 = parseSecondStageLevel(input.stageLevel2, slot.id2);
  if (!sl2.ok) return sl2;

  const shift1 =
    input.shift1Attendance ??
    inferredShiftFromTotals(slot.capM, slot.capE, attendanceCount, absenceCount, input.absenceNames.trim());
  const shift2: ShiftAttendanceSplit =
    input.shift2Attendance ??
    (slot.id2
      ? inferredShiftFromTotals(slot.capM2, slot.capE2, slot.att2, slot.abs2, slot.absNames2)
      : { attM: 0, absM: 0, attE: 0, absE: 0, namesM: "", namesE: "" });

  const r = await pool.query(
    `UPDATE college_exam_rooms
     SET study_subject_id = $1, study_subject_id_2 = $2, stage_level = $3, stage_level_2 = $4,
         serial_no = $5, room_name = $6, supervisor_name = $7, invigilators = $8,
         supervisor_name_2 = $9, invigilators_2 = $10,
         capacity_morning = $11, capacity_evening = $12, capacity_total = $13,
         capacity_morning_2 = $14, capacity_evening_2 = $15, capacity_total_2 = $16,
         attendance_count = $17, absence_count = $18, absence_names = $19,
         attendance_morning = $20, absence_morning = $21, attendance_evening = $22, absence_evening = $23,
         absence_names_morning = $24, absence_names_evening = $25,
         attendance_count_2 = $26, absence_count_2 = $27, absence_names_2 = $28,
         attendance_morning_2 = $29, absence_morning_2 = $30, attendance_evening_2 = $31, absence_evening_2 = $32,
         absence_names_morning_2 = $33, absence_names_evening_2 = $34,
         external_room_staff = $35,
         updated_at = NOW()
     WHERE id = $36 AND owner_user_id = $37`,
    [
      input.studySubjectId.trim(),
      slot.id2,
      sl1.v,
      sl2.v,
      serialNo,
      roomName,
      supervisorName,
      invigilatorsNorm.value,
      slot.sup2,
      slot.id2 ? slot.inv2 : null,
      slot.capM,
      slot.capE,
      slot.capT,
      slot.capM2,
      slot.capE2,
      slot.capT2,
      attendanceCount,
      absenceCount,
      input.absenceNames.trim(),
      shift1.attM,
      shift1.absM,
      shift1.attE,
      shift1.absE,
      shift1.namesM || null,
      shift1.namesE || null,
      slot.att2,
      slot.abs2,
      slot.absNames2 || null,
      shift2.attM,
      shift2.absM,
      shift2.attE,
      shift2.absE,
      shift2.namesM || null,
      shift2.namesE || null,
      externalStaffPayloadU,
      input.id.trim(),
      input.ownerUserId,
    ]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "القاعة غير موجودة أو لا تملك صلاحية تعديلها." };
  return { ok: true };
}

export type PatchCollegeExamRoomAttendanceInput =
  | {
      roomId: string;
      ownerUserId: string;
      studySubjectId: string;
      mode: "aggregate";
      attendanceCount: string;
      absenceCount: string;
      absenceNames: string;
    }
  | {
      roomId: string;
      ownerUserId: string;
      studySubjectId: string;
      mode: "split";
      attendanceMorning: string;
      absenceMorning: string;
      attendanceEvening: string;
      absenceEvening: string;
      absenceNamesMorning: string;
      absenceNamesEvening: string;
    };

function normalizeShiftFromPatch(
  capM: number,
  capE: number,
  input: PatchCollegeExamRoomAttendanceInput
):
  | { ok: true; shift: ShiftAttendanceSplit; aggAtt: number; aggAbs: number; aggNames: string }
  | { ok: false; message: string } {
  const cM = Math.max(0, Math.floor(capM));
  const cE = Math.max(0, Math.floor(capE));

  if (input.mode === "split") {
    const attM = toInt(input.attendanceMorning);
    const absM = toInt(input.absenceMorning);
    const attE = toInt(input.attendanceEvening);
    const absE = toInt(input.absenceEvening);
    const namesM = input.absenceNamesMorning.trim();
    const namesE = input.absenceNamesEvening.trim();
    if (cM + cE <= 0) {
      return { ok: false, message: "سعة القاعة لهذه المادة غير محددة في إدارة القاعات." };
    }
    if (cM > 0 && attM + absM !== cM) {
      return {
        ok: false,
        message: "مجموع حضور وغياب الدوام الصباحي يجب أن يساوي سعة الصباحي المعتمدة في إدارة القاعات.",
      };
    }
    if (cM === 0 && (attM !== 0 || absM !== 0)) {
      return { ok: false, message: "لا توجد سعة صباحية مسجّلة؛ يجب أن يكون حضور وغياب الصباحي صفراً." };
    }
    if (cE > 0 && attE + absE !== cE) {
      return {
        ok: false,
        message: "مجموع حضور وغياب الدوام المسائي يجب أن يساوي سعة المسائي المعتمدة في إدارة القاعات.",
      };
    }
    if (cE === 0 && (attE !== 0 || absE !== 0)) {
      return { ok: false, message: "لا توجد سعة مسائية مسجّلة؛ يجب أن يكون حضور وغياب المسائي صفراً." };
    }
    if (absM > 0 && !namesM) {
      return { ok: false, message: "أدخل أسماء الغائبين للدوام الصباحي أو صفّر غياب الصباحي." };
    }
    if (absE > 0 && !namesE) {
      return { ok: false, message: "أدخل أسماء الغائبين للدوام المسائي أو صفّر غياب المسائي." };
    }
    return {
      ok: true,
      shift: { attM, absM, attE, absE, namesM, namesE },
      aggAtt: attM + attE,
      aggAbs: absM + absE,
      aggNames: mergeShiftAbsenceNames(namesM, namesE),
    };
  }

  const att = toInt(input.attendanceCount);
  const abs = toInt(input.absenceCount);
  const names = input.absenceNames.trim();
  if (cM > 0 && cE > 0) {
    return {
      ok: false,
      message: "القاعة مسجّلة بدوام صباحي ومسائي — عبّئ الحضور والغياب لكل دوام على حدة.",
    };
  }
  if (cM + cE <= 0) {
    return { ok: false, message: "سعة القاعة لهذه المادة غير محددة في إدارة القاعات." };
  }
  if (att + abs !== cM + cE) {
    return { ok: false, message: "مجموع الحضور والغياب يجب أن يساوي السعة المعتمدة لهذه المادة في القاعة." };
  }
  if (abs > 0 && !names) {
    return { ok: false, message: "أدخل أسماء الغائبين أو صفّر الغياب." };
  }
  if (cE <= 0) {
    return {
      ok: true,
      shift: { attM: att, absM: abs, attE: 0, absE: 0, namesM: names, namesE: "" },
      aggAtt: att,
      aggAbs: abs,
      aggNames: names,
    };
  }
  return {
    ok: true,
    shift: { attM: 0, absM: 0, attE: att, absE: abs, namesM: "", namesE: names },
    aggAtt: att,
    aggAbs: abs,
    aggNames: names,
  };
}

/** تحديث الحضور/الغياب لأحد الامتحانين حسب study_subject_id الجدول (مع دعم تفصيل صباحي/مسائي). */
export async function patchCollegeExamRoomAttendance(
  input: PatchCollegeExamRoomAttendanceInput
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  if (!/^\d+$/.test(input.roomId.trim())) return { ok: false, message: "معرّف القاعة غير صالح." };
  if (!/^\d+$/.test(input.studySubjectId.trim())) return { ok: false, message: "معرّف المادة غير صالح." };
  const pool = getDbPool();
  const capR = await pool.query<{
    study_subject_id: string | number;
    study_subject_id_2: string | number | null;
    capacity_morning: number;
    capacity_evening: number;
    capacity_total: number;
    capacity_morning_2: number;
    capacity_evening_2: number;
    capacity_total_2: number;
  }>(
    `SELECT study_subject_id, study_subject_id_2,
            capacity_morning, capacity_evening, capacity_total,
            capacity_morning_2, capacity_evening_2, capacity_total_2
     FROM college_exam_rooms WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
    [input.roomId.trim(), input.ownerUserId]
  );
  if ((capR.rowCount ?? 0) === 0) return { ok: false, message: "القاعة غير موجودة." };
  const row = capR.rows[0]!;
  const sid = input.studySubjectId.trim();
  const primary = String(row.study_subject_id);
  const second = row.study_subject_id_2 != null ? String(row.study_subject_id_2) : null;

  if (sid === primary) {
    const capM = Number(row.capacity_morning ?? 0);
    const capE = Number(row.capacity_evening ?? 0);
    const resolved = normalizeShiftFromPatch(capM, capE, input);
    if (!resolved.ok) return resolved;
    const { shift, aggAtt, aggAbs, aggNames } = resolved;
    const r = await pool.query(
      `UPDATE college_exam_rooms
       SET attendance_count = $1, absence_count = $2, absence_names = $3,
           attendance_morning = $4, absence_morning = $5, attendance_evening = $6, absence_evening = $7,
           absence_names_morning = $8, absence_names_evening = $9,
           updated_at = NOW()
       WHERE id = $10 AND owner_user_id = $11`,
      [
        aggAtt,
        aggAbs,
        aggNames || null,
        shift.attM,
        shift.absM,
        shift.attE,
        shift.absE,
        shift.namesM || null,
        shift.namesE || null,
        input.roomId.trim(),
        input.ownerUserId,
      ]
    );
    if ((r.rowCount ?? 0) === 0) return { ok: false, message: "تعذر تحديث بيانات الحضور." };
    return { ok: true };
  }

  if (second && sid === second) {
    const capM = Number(row.capacity_morning_2 ?? 0);
    const capE = Number(row.capacity_evening_2 ?? 0);
    const resolved = normalizeShiftFromPatch(capM, capE, input);
    if (!resolved.ok) return resolved;
    const { shift, aggAtt, aggAbs, aggNames } = resolved;
    const r = await pool.query(
      `UPDATE college_exam_rooms
       SET attendance_count_2 = $1, absence_count_2 = $2, absence_names_2 = $3,
           attendance_morning_2 = $4, absence_morning_2 = $5, attendance_evening_2 = $6, absence_evening_2 = $7,
           absence_names_morning_2 = $8, absence_names_evening_2 = $9,
           updated_at = NOW()
       WHERE id = $10 AND owner_user_id = $11`,
      [
        aggAtt,
        aggAbs,
        aggNames || null,
        shift.attM,
        shift.absM,
        shift.attE,
        shift.absE,
        shift.namesM || null,
        shift.namesE || null,
        input.roomId.trim(),
        input.ownerUserId,
      ]
    );
    if ((r.rowCount ?? 0) === 0) return { ok: false, message: "تعذر تحديث بيانات الحضور." };
    return { ok: true };
  }

  return {
    ok: false,
    message: "مادة الجدول لا تطابق المواد المعرّفة لهذه القاعة (الأولى أو الثانية).",
  };
}

export async function deleteCollegeExamRoom(input: {
  id: string;
  ownerUserId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  if (!/^\d+$/.test(input.id.trim())) return { ok: false, message: "معرّف القاعة غير صالح." };
  const pool = getDbPool();
  const inUse = await pool.query(
    `SELECT 1 FROM college_exam_schedules WHERE room_id = $1 AND owner_user_id = $2 LIMIT 1`,
    [input.id.trim(), input.ownerUserId]
  );
  if ((inUse.rowCount ?? 0) > 0) {
    return {
      ok: false,
      message: "لا يمكن حذف القاعة لأنها مستخدمة في جداول امتحانية. احذف أو عدّل تلك الإدخالات أولاً.",
    };
  }
  const r = await pool.query(`DELETE FROM college_exam_rooms WHERE id = $1 AND owner_user_id = $2`, [
    input.id.trim(),
    input.ownerUserId,
  ]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "القاعة غير موجودة أو لا تملك صلاحية حذفها." };
  return { ok: true };
}
