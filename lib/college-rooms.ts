import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

export type CollegeExamRoomRow = {
  id: string;
  owner_user_id: string;
  study_subject_id: string;
  study_subject_name: string;
  /** مادة امتحانية ثانية في نفس القاعة ونفس نافذة الزمن (عند الجدولة). */
  study_subject_id_2: string | null;
  study_subject_name_2: string | null;
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
  attendance_count_2: number;
  absence_count_2: number;
  absence_names_2: string;
  /** المرحلة الدراسية المرتبطة بالامتحان الأول في القاعة */
  stage_level: number;
  /** المرحلة للامتحان الثاني عند وجوده */
  stage_level_2: number | null;
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
  if (!Number.isInteger(n) || n < 1 || n > 6) {
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
  if (!Number.isInteger(n) || n < 1 || n > 6) {
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

export async function listCollegeExamRoomsByOwner(ownerUserId: string): Promise<CollegeExamRoomRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  await repairAllZeroSerialsForOwner(pool, ownerUserId);
  const r = await pool.query<{
    id: string | number;
    owner_user_id: string | number;
    study_subject_id: string | number;
    study_subject_name: string;
    study_subject_id_2: string | number | null;
    study_subject_name_2: string | null;
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
    attendance_count_2: number;
    absence_count_2: number;
    absence_names_2: string | null;
    stage_level: number;
    stage_level_2: number | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT r.id, r.owner_user_id, r.study_subject_id,
            s.subject_name AS study_subject_name,
            r.study_subject_id_2,
            s2.subject_name AS study_subject_name_2,
            r.serial_no, r.room_name, r.supervisor_name,
            r.invigilators,
            r.supervisor_name_2, r.invigilators_2,
            r.stage_level, r.stage_level_2,
            r.capacity_morning, r.capacity_evening, r.capacity_total,
            r.capacity_morning_2, r.capacity_evening_2, r.capacity_total_2,
            r.attendance_count, r.absence_count, r.absence_names,
            r.attendance_count_2, r.absence_count_2, r.absence_names_2,
            r.created_at, r.updated_at
     FROM college_exam_rooms r
     INNER JOIN college_study_subjects s ON s.id = r.study_subject_id
     LEFT JOIN college_study_subjects s2 ON s2.id = r.study_subject_id_2
     WHERE r.owner_user_id = $1
     ORDER BY r.serial_no ASC, r.created_at DESC`,
    [ownerUserId]
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    owner_user_id: String(row.owner_user_id),
    study_subject_id: String(row.study_subject_id),
    study_subject_name: row.study_subject_name,
    study_subject_id_2: row.study_subject_id_2 != null ? String(row.study_subject_id_2) : null,
    study_subject_name_2: row.study_subject_name_2 ?? null,
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
    attendance_count_2: Number(row.attendance_count_2 ?? 0),
    absence_count_2: Number(row.absence_count_2 ?? 0),
    absence_names_2: row.absence_names_2 ?? "",
    stage_level: Number(row.stage_level ?? 1),
    stage_level_2: row.stage_level_2 != null ? Number(row.stage_level_2) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
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
};

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

  await pool.query(
    `INSERT INTO college_exam_rooms
      (owner_user_id, study_subject_id, study_subject_id_2, stage_level, stage_level_2, serial_no, room_name, supervisor_name, invigilators,
       supervisor_name_2, invigilators_2,
       capacity_morning, capacity_evening, capacity_total,
       capacity_morning_2, capacity_evening_2, capacity_total_2,
       attendance_count, absence_count, absence_names,
       attendance_count_2, absence_count_2, absence_names_2,
       created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW(),NOW())`,
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
      slot.att2,
      slot.abs2,
      slot.absNames2 || null,
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

  const r = await pool.query(
    `UPDATE college_exam_rooms
     SET study_subject_id = $1, study_subject_id_2 = $2, stage_level = $3, stage_level_2 = $4,
         serial_no = $5, room_name = $6, supervisor_name = $7, invigilators = $8,
         supervisor_name_2 = $9, invigilators_2 = $10,
         capacity_morning = $11, capacity_evening = $12, capacity_total = $13,
         capacity_morning_2 = $14, capacity_evening_2 = $15, capacity_total_2 = $16,
         attendance_count = $17, absence_count = $18, absence_names = $19,
         attendance_count_2 = $20, absence_count_2 = $21, absence_names_2 = $22, updated_at = NOW()
     WHERE id = $23 AND owner_user_id = $24`,
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
      slot.att2,
      slot.abs2,
      slot.absNames2 || null,
      input.id.trim(),
      input.ownerUserId,
    ]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "القاعة غير موجودة أو لا تملك صلاحية تعديلها." };
  return { ok: true };
}

/** تحديث الحضور/الغياب لأحد الامتحانين حسب study_subject_id الجدول. */
export async function patchCollegeExamRoomAttendance(input: {
  roomId: string;
  ownerUserId: string;
  studySubjectId: string;
  attendanceCount: string;
  absenceCount: string;
  absenceNames: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  if (!/^\d+$/.test(input.roomId.trim())) return { ok: false, message: "معرّف القاعة غير صالح." };
  if (!/^\d+$/.test(input.studySubjectId.trim())) return { ok: false, message: "معرّف المادة غير صالح." };
  const attendanceCount = toInt(input.attendanceCount);
  const absenceCount = toInt(input.absenceCount);
  const absenceNames = input.absenceNames.trim();
  if (attendanceCount < 0 || absenceCount < 0) return { ok: false, message: "قيم الحضور والغياب غير صالحة." };
  const pool = getDbPool();
  const capR = await pool.query<{
    study_subject_id: string | number;
    study_subject_id_2: string | number | null;
    capacity_total: number;
    capacity_total_2: number;
  }>(
    `SELECT study_subject_id, study_subject_id_2, capacity_total, capacity_total_2
     FROM college_exam_rooms WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
    [input.roomId.trim(), input.ownerUserId]
  );
  if ((capR.rowCount ?? 0) === 0) return { ok: false, message: "القاعة غير موجودة." };
  const row = capR.rows[0]!;
  const sid = input.studySubjectId.trim();
  const primary = String(row.study_subject_id);
  const second = row.study_subject_id_2 != null ? String(row.study_subject_id_2) : null;

  if (sid === primary) {
    const capacityTotal = Number(row.capacity_total ?? 0);
    if (attendanceCount + absenceCount > capacityTotal) {
      return { ok: false, message: "مجموع الحضور والغياب يتجاوز السعة المسجّلة للامتحان الأول في القاعة." };
    }
    const r = await pool.query(
      `UPDATE college_exam_rooms
       SET attendance_count = $1, absence_count = $2, absence_names = $3, updated_at = NOW()
       WHERE id = $4 AND owner_user_id = $5`,
      [attendanceCount, absenceCount, absenceNames || null, input.roomId.trim(), input.ownerUserId]
    );
    if ((r.rowCount ?? 0) === 0) return { ok: false, message: "تعذر تحديث بيانات الحضور." };
    return { ok: true };
  }

  if (second && sid === second) {
    const capacityTotal2 = Number(row.capacity_total_2 ?? 0);
    if (attendanceCount + absenceCount > capacityTotal2) {
      return { ok: false, message: "مجموع الحضور والغياب يتجاوز السعة المسجّلة للامتحان الثاني في القاعة." };
    }
    const r = await pool.query(
      `UPDATE college_exam_rooms
       SET attendance_count_2 = $1, absence_count_2 = $2, absence_names_2 = $3, updated_at = NOW()
       WHERE id = $4 AND owner_user_id = $5`,
      [attendanceCount, absenceCount, absenceNames || null, input.roomId.trim(), input.ownerUserId]
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
