import type { StudyType } from "@/lib/college-study-subjects";
import { assertExamDateNotInPast } from "@/lib/exam-schedule-date";
import { type ExamMealSlot, normalizeExamMealSlot, formatExamMealSlotLabel } from "@/lib/exam-meal-slot";
import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

function normalizeScheduleStudyTypeDb(v: string | null | undefined): StudyType {
  const t = v?.trim().toUpperCase();
  if (t === "SEMESTER") return "SEMESTER";
  if (t === "COURSES") return "COURSES";
  if (t === "BOLOGNA") return "BOLOGNA";
  return "ANNUAL";
}

export type ScheduleType = "FINAL" | "SEMESTER";

export type { ExamMealSlot } from "@/lib/exam-meal-slot";
export { normalizeExamMealSlot, formatExamMealSlotLabel } from "@/lib/exam-meal-slot";

export type CollegeExamScheduleRow = {
  id: string;
  owner_user_id: string;
  college_subject_id: string;
  college_subject_name: string;
  study_subject_id: string;
  study_subject_name: string;
  room_id: string;
  room_name: string;
  stage_level: number;
  /** نوع الدراسة للمادة (من `college_study_subjects`) */
  study_type: StudyType;
  schedule_type: ScheduleType;
  workflow_status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  term_label: string | null;
  academic_year: string | null;
  exam_date: string;
  /** 1 = الوجبة الأولى، 2 = الوجبة الثانية */
  meal_slot: ExamMealSlot;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  notes: string | null;
  created_at: Date;
};

function toMinutes(time: string) {
  const [h, m] = time.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

function asNumericUserId(value: string) {
  const v = value.trim();
  return /^[0-9]+$/.test(v) ? v : null;
}

export {
  examScheduleLogicalGroupKeyFromRow,
  type ExamScheduleLogicalGroupFields,
} from "@/lib/exam-schedule-logical-group";

/** القاعة يجب أن تكون مُعرّفة في «إدارة القاعات» للمادة الامتحانية (الأولى أو الثانية في نفس القاعة). */
export async function assertExamRoomAllowsStudySubject(
  pool: ReturnType<typeof getDbPool>,
  ownerUserId: string,
  roomId: string,
  studySubjectId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await pool.query(
    `SELECT 1 FROM college_exam_rooms
     WHERE id = $1::bigint AND owner_user_id = $2
       AND (
         study_subject_id::text = $3
         OR (study_subject_id_2 IS NOT NULL AND study_subject_id_2::text = $3)
       )
     LIMIT 1`,
    [roomId.trim(), ownerUserId, studySubjectId.trim()]
  );
  if ((r.rowCount ?? 0) === 0) {
    return {
      ok: false,
      message:
        "القاعة المختارة غير مرتبطة بهذه المادة في «إدارة القاعات». اختر قاعة مُعرَّفة للمادة الدراسية (أو أضف قاعة جديدة لنفس المادة).",
    };
  }
  return { ok: true };
}

type ValidateScheduleSlotParams = {
  ownerUserId: string;
  collegeSubjectId: string;
  studySubjectId: string;
  roomId: string;
  stageLevel: string;
  scheduleType: string;
  termLabel: string;
  academicYear: string;
  examDate: string;
  mealSlot: string;
  startTime: string;
  endTime: string;
  /** عند التعديل: استثناء الصف الحالي من فحوص التكرار/التداخل لنفس القاعة */
  excludeScheduleId?: string;
};

async function validateExamScheduleSlot(
  pool: ReturnType<typeof getDbPool>,
  input: ValidateScheduleSlotParams
): Promise<
  { ok: false; message: string } | { ok: true; stageNum: number; startMin: number; endMin: number; scheduleTypeDb: string }
> {
  if (!/^\d+$/.test(input.collegeSubjectId.trim())) return { ok: false, message: "يرجى اختيار القسم أو الفرع." };
  if (!/^\d+$/.test(input.studySubjectId.trim())) return { ok: false, message: "يرجى اختيار المادة الدراسية." };
  if (!/^\d+$/.test(input.roomId.trim())) return { ok: false, message: "يرجى اختيار القاعة الامتحانية." };
  if (!/^\d+$/.test(input.stageLevel.trim())) return { ok: false, message: "يرجى اختيار المرحلة." };
  if (!input.termLabel.trim()) return { ok: false, message: "يرجى اختيار الفصل الدراسي." };
  if (!input.academicYear.trim()) return { ok: false, message: "يرجى تحديد العام الدراسي." };
  const pastCheck = assertExamDateNotInPast(input.examDate);
  if (!pastCheck.ok) return pastCheck;
  if (!input.startTime.trim()) return { ok: false, message: "يرجى تحديد وقت بداية الامتحان." };
  if (!input.endTime.trim()) return { ok: false, message: "يرجى تحديد وقت نهاية الامتحان." };
  const startMin = toMinutes(input.startTime.trim());
  const endMin = toMinutes(input.endTime.trim());
  if (startMin < 0 || endMin < 0) return { ok: false, message: "تنسيق الوقت غير صالح." };
  if (endMin <= startMin) return { ok: false, message: "وقت نهاية الامتحان يجب أن يكون بعد وقت البداية." };

  const subjectScope = await pool.query(
    `SELECT 1
     FROM college_study_subjects
     WHERE id = $1 AND owner_user_id = $2 AND college_subject_id = $3
     LIMIT 1`,
    [input.studySubjectId.trim(), input.ownerUserId, input.collegeSubjectId.trim()]
  );
  if ((subjectScope.rowCount ?? 0) === 0) {
    return { ok: false, message: "المادة المختارة لا تتبع القسم/الفرع المحدد." };
  }
  const roomScope = await pool.query(
    `SELECT 1 FROM college_exam_rooms WHERE id = $1::bigint AND owner_user_id = $2 LIMIT 1`,
    [input.roomId.trim(), input.ownerUserId]
  );
  if ((roomScope.rowCount ?? 0) === 0) return { ok: false, message: "القاعة المختارة غير موجودة." };
  const roomSubjectOk = await assertExamRoomAllowsStudySubject(
    pool,
    input.ownerUserId,
    input.roomId.trim(),
    input.studySubjectId.trim()
  );
  if (!roomSubjectOk.ok) return roomSubjectOk;

  const holiday = await pool.query(
    `SELECT holiday_name
     FROM college_holidays
     WHERE owner_user_id = $1 AND holiday_date = $2
     LIMIT 1`,
    [input.ownerUserId, input.examDate.trim()]
  );
  if ((holiday.rowCount ?? 0) > 0) {
    const holidayName = String((holiday.rows[0] as { holiday_name?: string })?.holiday_name ?? "عطلة");
    return { ok: false, message: `لا يمكن الجدولة في هذا اليوم (${holidayName}).` };
  }

  const stageNum = Number(input.stageLevel.trim());
  const mealSlotNum = normalizeExamMealSlot(input.mealSlot ?? "1");
  const excludeId = input.excludeScheduleId?.trim() && /^\d+$/.test(input.excludeScheduleId.trim())
    ? input.excludeScheduleId.trim()
    : null;

  const dup = await pool.query(
    `SELECT 1
     FROM college_exam_schedules
     WHERE owner_user_id = $1
       AND college_subject_id = $2::bigint
       AND study_subject_id = $3::bigint
       AND stage_level = $4
       AND exam_date = $5::date
       AND start_time = $6::time
       AND end_time = $7::time
       AND room_id = $8::bigint
       AND COALESCE(meal_slot, 1) = $9
       AND ($10::bigint IS NULL OR id <> $10::bigint)
     LIMIT 1`,
    [
      input.ownerUserId,
      input.collegeSubjectId.trim(),
      input.studySubjectId.trim(),
      stageNum,
      input.examDate.trim(),
      input.startTime.trim(),
      input.endTime.trim(),
      input.roomId.trim(),
      mealSlotNum,
      excludeId,
    ]
  );
  if ((dup.rowCount ?? 0) > 0) {
    return { ok: false, message: "هذه المادة مضافة مسبقًا لنفس القاعة ولنفس المرحلة وبنفس التوقيت." };
  }

  const cohortConflict = await pool.query(
    `SELECT 1
     FROM college_exam_schedules
     WHERE owner_user_id = $1
       AND college_subject_id = $2::bigint
       AND study_subject_id = $3::bigint
       AND stage_level = $4
       AND exam_date = $5::date
       AND (start_time < $6::time AND end_time > $7::time)
       AND room_id = $8::bigint
       AND ($9::bigint IS NULL OR id <> $9::bigint)
     LIMIT 1`,
    [
      input.ownerUserId,
      input.collegeSubjectId.trim(),
      input.studySubjectId.trim(),
      stageNum,
      input.examDate.trim(),
      input.endTime.trim(),
      input.startTime.trim(),
      input.roomId.trim(),
      excludeId,
    ]
  );
  if ((cohortConflict.rowCount ?? 0) > 0) {
    return { ok: false, message: "تعارض: نفس المادة والمرحلة مسجّلة في وقت متداخل في هذه القاعة." };
  }

  const scheduleTypeDb = input.scheduleType === "SEMESTER" ? "SEMESTER" : "FINAL";
  return { ok: true, stageNum, startMin, endMin, scheduleTypeDb };
}

export type CollegeRoomScheduleHint = {
  exam_date: string;
  start_time: string;
  end_time: string;
  study_subject_name: string;
  meal_slot_label: string;
};

/** تلميحات جداول لكل قاعة (للعرض في إدارة القاعات). */
export async function listCollegeExamScheduleHintsByRoom(
  ownerUserId: string
): Promise<Record<string, CollegeRoomScheduleHint[]>> {
  if (!isDatabaseConfigured()) return {};
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    room_id: string | number;
    exam_date: string;
    start_time: string;
    end_time: string;
    study_subject_name: string;
    meal_slot: number | string | null;
  }>(
    `SELECT e.room_id, e.exam_date::text, e.start_time::text, e.end_time::text, s.subject_name AS study_subject_name,
            COALESCE(e.meal_slot, 1) AS meal_slot
     FROM college_exam_schedules e
     INNER JOIN college_study_subjects s ON s.id = e.study_subject_id
     WHERE e.owner_user_id = $1
     ORDER BY e.exam_date ASC, e.meal_slot ASC, e.start_time ASC, e.id ASC`,
    [ownerUserId]
  );
  const out: Record<string, CollegeRoomScheduleHint[]> = {};
  for (const row of r.rows) {
    const id = String(row.room_id);
    if (!out[id]) out[id] = [];
    const ms = normalizeExamMealSlot(String(row.meal_slot ?? 1));
    out[id].push({
      exam_date: row.exam_date,
      start_time: String(row.start_time).slice(0, 5),
      end_time: String(row.end_time).slice(0, 5),
      study_subject_name: row.study_subject_name,
      meal_slot_label: formatExamMealSlotLabel(ms),
    });
  }
  return out;
}

async function writeScheduleAudit(
  ownerUserId: string,
  action: string,
  targetScheduleId: string | null,
  metadata: Record<string, unknown>
) {
  const pool = getDbPool();
  const actor = asNumericUserId(ownerUserId);
  const target = targetScheduleId && /^[0-9]+$/.test(targetScheduleId) ? targetScheduleId : null;
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_user_id, metadata)
       VALUES ($1, $2, $3, $4)`,
      [actor, action, target, JSON.stringify(metadata)]
    );
  } catch {
    // لا نكسر العملية الأساسية إذا فشل سجل التدقيق.
  }
}

export async function listCollegeExamSchedulesByOwner(ownerUserId: string): Promise<CollegeExamScheduleRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string | number;
    owner_user_id: string | number;
    college_subject_id: string | number;
    college_subject_name: string;
    study_subject_id: string | number;
    study_subject_name: string;
    room_id: string | number;
    room_name: string;
    stage_level: number;
    study_type: string;
    schedule_type: string;
    workflow_status: string;
    term_label: string | null;
    academic_year: string | null;
    exam_date: string;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    notes: string | null;
    created_at: Date;
    meal_slot: number | string | null;
  }>(
    `SELECT e.id, e.owner_user_id, e.college_subject_id, c.branch_name AS college_subject_name,
            e.study_subject_id, s.subject_name AS study_subject_name,
            e.room_id, r.room_name, e.stage_level,
            COALESCE(s.study_type::text, 'ANNUAL') AS study_type,
            e.schedule_type, COALESCE(e.workflow_status, 'DRAFT') AS workflow_status,
            e.term_label, e.academic_year, e.exam_date::text, COALESCE(e.meal_slot, 1) AS meal_slot,
            e.start_time::text, e.end_time::text,
            e.duration_minutes, e.notes, e.created_at
     FROM college_exam_schedules e
     INNER JOIN college_subjects c ON c.id = e.college_subject_id
     INNER JOIN college_study_subjects s ON s.id = e.study_subject_id
     INNER JOIN college_exam_rooms r ON r.id = e.room_id
     WHERE e.owner_user_id = $1
     ORDER BY e.exam_date ASC, e.meal_slot ASC, e.start_time ASC, e.created_at ASC`,
    [ownerUserId]
  );
  return r.rows.map(mapScheduleQueryRow);
}

function mapScheduleQueryRow(x: {
  id: string | number;
  owner_user_id: string | number;
  college_subject_id: string | number;
  college_subject_name: string;
  study_subject_id: string | number;
  study_subject_name: string;
  room_id: string | number;
  room_name: string;
  stage_level: number;
  study_type: string;
  schedule_type: string;
  workflow_status: string;
  term_label: string | null;
  academic_year: string | null;
  exam_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  notes: string | null;
  created_at: Date;
  meal_slot: number | string | null;
}): CollegeExamScheduleRow {
  return {
    id: String(x.id),
    owner_user_id: String(x.owner_user_id),
    college_subject_id: String(x.college_subject_id),
    college_subject_name: x.college_subject_name,
    study_subject_id: String(x.study_subject_id),
    study_subject_name: x.study_subject_name,
    room_id: String(x.room_id),
    room_name: x.room_name,
    stage_level: Number(x.stage_level ?? 1),
    study_type: normalizeScheduleStudyTypeDb(x.study_type),
    schedule_type: x.schedule_type === "SEMESTER" ? "SEMESTER" : "FINAL",
    workflow_status:
      x.workflow_status === "APPROVED"
        ? "APPROVED"
        : x.workflow_status === "REJECTED"
          ? "REJECTED"
          : x.workflow_status === "SUBMITTED"
            ? "SUBMITTED"
            : "DRAFT",
    term_label: x.term_label,
    academic_year: x.academic_year,
    exam_date: x.exam_date,
    meal_slot: normalizeExamMealSlot(String(x.meal_slot ?? 1)),
    start_time: x.start_time.slice(0, 5),
    end_time: x.end_time.slice(0, 5),
    duration_minutes: x.duration_minutes,
    notes: x.notes,
    created_at: x.created_at,
  };
}

/** جداول امتحان لمالك واحد في يوم محدد فقط — مطابق لحقول «الجداول الامتحانية». */
export async function listCollegeExamSchedulesByOwnerForExamDate(
  ownerUserId: string,
  examDate: string
): Promise<CollegeExamScheduleRow[]> {
  if (!isDatabaseConfigured()) return [];
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string | number;
    owner_user_id: string | number;
    college_subject_id: string | number;
    college_subject_name: string;
    study_subject_id: string | number;
    study_subject_name: string;
    room_id: string | number;
    room_name: string;
    stage_level: number;
    study_type: string;
    schedule_type: string;
    workflow_status: string;
    term_label: string | null;
    academic_year: string | null;
    exam_date: string;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    notes: string | null;
    created_at: Date;
    meal_slot: number | string | null;
  }>(
    `SELECT e.id, e.owner_user_id, e.college_subject_id, c.branch_name AS college_subject_name,
            e.study_subject_id, s.subject_name AS study_subject_name,
            e.room_id, r.room_name, e.stage_level,
            COALESCE(s.study_type::text, 'ANNUAL') AS study_type,
            e.schedule_type, COALESCE(e.workflow_status, 'DRAFT') AS workflow_status,
            e.term_label, e.academic_year, e.exam_date::text, COALESCE(e.meal_slot, 1) AS meal_slot,
            e.start_time::text, e.end_time::text,
            e.duration_minutes, e.notes, e.created_at
     FROM college_exam_schedules e
     INNER JOIN college_subjects c ON c.id = e.college_subject_id
     INNER JOIN college_study_subjects s ON s.id = e.study_subject_id
     INNER JOIN college_exam_rooms r ON r.id = e.room_id
     WHERE e.owner_user_id = $1 AND e.exam_date = $2::date
     ORDER BY e.meal_slot ASC, e.start_time ASC, e.created_at ASC`,
    [ownerUserId, d]
  );
  return r.rows.map(mapScheduleQueryRow);
}

/** صف جدول امتحاني مع تسمية التشكيل لعرض المدير لجميع الحسابات */
export type AdminCollegeExamScheduleRow = CollegeExamScheduleRow & {
  formation_label: string;
  owner_username: string;
};

/**
 * كل جداول الامتحانات لحسابات الكلية — نفس حقول وترتيب `listCollegeExamSchedulesByOwner` لكل مالك.
 */
export async function listAllCollegeExamSchedulesForAdmin(): Promise<AdminCollegeExamScheduleRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string | number;
    owner_user_id: string | number;
    college_subject_id: string | number;
    college_subject_name: string;
    study_subject_id: string | number;
    study_subject_name: string;
    room_id: string | number;
    room_name: string;
    stage_level: number;
    study_type: string;
    schedule_type: string;
    workflow_status: string;
    term_label: string | null;
    academic_year: string | null;
    exam_date: string;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    notes: string | null;
    created_at: Date;
    meal_slot: number | string | null;
    formation_label: string;
    owner_username: string;
  }>(
    `SELECT e.id, e.owner_user_id, e.college_subject_id, c.branch_name AS college_subject_name,
            e.study_subject_id, s.subject_name AS study_subject_name,
            e.room_id, r.room_name, e.stage_level,
            COALESCE(s.study_type::text, 'ANNUAL') AS study_type,
            e.schedule_type, COALESCE(e.workflow_status, 'DRAFT') AS workflow_status,
            e.term_label, e.academic_year, e.exam_date::text, COALESCE(e.meal_slot, 1) AS meal_slot,
            e.start_time::text, e.end_time::text,
            e.duration_minutes, e.notes, e.created_at,
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
     FROM college_exam_schedules e
     INNER JOIN college_subjects c
       ON c.id = e.college_subject_id AND c.owner_user_id = e.owner_user_id
     INNER JOIN college_study_subjects s
       ON s.id = e.study_subject_id AND s.owner_user_id = e.owner_user_id
     INNER JOIN college_exam_rooms r
       ON r.id = e.room_id AND r.owner_user_id = e.owner_user_id
     INNER JOIN users u
       ON u.id = e.owner_user_id AND u.role = 'COLLEGE' AND u.deleted_at IS NULL
     LEFT JOIN college_account_profiles p ON p.user_id = u.id
     ORDER BY formation_label ASC, u.username ASC, e.exam_date ASC, e.meal_slot ASC, e.start_time ASC, e.created_at ASC`
  );
  return r.rows.map((x) => ({
    id: String(x.id),
    owner_user_id: String(x.owner_user_id),
    college_subject_id: String(x.college_subject_id),
    college_subject_name: x.college_subject_name,
    study_subject_id: String(x.study_subject_id),
    study_subject_name: x.study_subject_name,
    room_id: String(x.room_id),
    room_name: x.room_name,
    stage_level: Number(x.stage_level ?? 1),
    study_type: normalizeScheduleStudyTypeDb(x.study_type),
    schedule_type: x.schedule_type === "SEMESTER" ? "SEMESTER" : "FINAL",
    workflow_status:
      x.workflow_status === "APPROVED"
        ? "APPROVED"
        : x.workflow_status === "REJECTED"
          ? "REJECTED"
          : x.workflow_status === "SUBMITTED"
            ? "SUBMITTED"
            : "DRAFT",
    term_label: x.term_label,
    academic_year: x.academic_year,
    exam_date: x.exam_date,
    meal_slot: normalizeExamMealSlot(String(x.meal_slot ?? 1)),
    start_time: x.start_time.slice(0, 5),
    end_time: x.end_time.slice(0, 5),
    duration_minutes: x.duration_minutes,
    notes: x.notes,
    created_at: x.created_at,
    formation_label: x.formation_label?.trim() || x.owner_username || "—",
    owner_username: x.owner_username ?? "",
  }));
}

export type CreateCollegeExamScheduleCoreInput = {
  ownerUserId: string;
  collegeSubjectId: string;
  studySubjectId: string;
  stageLevel: string;
  scheduleType: string;
  termLabel: string;
  academicYear: string;
  examDate: string;
  mealSlot: string;
  startTime: string;
  endTime: string;
  notes: string;
};

/** إنشاء جلسة واحدة في قاعة واحدة (السلوك السابق). */
export async function createCollegeExamSchedule(
  input: CreateCollegeExamScheduleCoreInput & { roomId: string }
): Promise<{ ok: true; row: CollegeExamScheduleRow } | { ok: false; message: string }> {
  const multi = await createCollegeExamSchedulesMultiRoom({ ...input, roomIds: [input.roomId] });
  if (!multi.ok) return multi;
  return { ok: true, row: multi.rows[0]! };
}

/**
 * إنشاء نفس الجلسة الامتحانية (نفس الوقت والمادة) في عدة قاعات — كل قاعة صف جدول مستقل (رفع موقف واعتماد لكل قاعة).
 */
export async function createCollegeExamSchedulesMultiRoom(
  input: CreateCollegeExamScheduleCoreInput & { roomIds: string[] }
): Promise<{ ok: true; rows: CollegeExamScheduleRow[] } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  const seen = new Set<string>();
  const roomIds: string[] = [];
  for (const raw of input.roomIds) {
    const id = String(raw ?? "").trim();
    if (!/^\d+$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    roomIds.push(id);
  }
  if (roomIds.length === 0) return { ok: false, message: "يرجى اختيار قاعة امتحانية واحدة على الأقل." };

  const pool = getDbPool();
  const validated: Array<{ roomId: string; stageNum: number; duration: number; scheduleTypeDb: string }> = [];

  for (const roomId of roomIds) {
    const v = await validateExamScheduleSlot(pool, {
      ownerUserId: input.ownerUserId,
      collegeSubjectId: input.collegeSubjectId,
      studySubjectId: input.studySubjectId,
      roomId,
      stageLevel: input.stageLevel,
      scheduleType: input.scheduleType,
      termLabel: input.termLabel,
      academicYear: input.academicYear,
      examDate: input.examDate,
      mealSlot: input.mealSlot,
      startTime: input.startTime,
      endTime: input.endTime,
    });
    if (!v.ok) return v;
    validated.push({
      roomId,
      stageNum: v.stageNum,
      duration: v.endMin - v.startMin,
      scheduleTypeDb: v.scheduleTypeDb,
    });
  }

  const insertedIds: string[] = [];
  try {
    await pool.query("BEGIN");
    for (const slot of validated) {
      const mealN = normalizeExamMealSlot(input.mealSlot);
      const ins = await pool.query<{ id: string | number }>(
        `INSERT INTO college_exam_schedules
          (owner_user_id, college_subject_id, study_subject_id, room_id, schedule_type, workflow_status, term_label,
           academic_year, stage_level, exam_date, meal_slot, start_time, end_time, duration_minutes, notes, created_at, updated_at)
         VALUES ($1,$2::bigint,$3::bigint,$4::bigint,$5,'APPROVED',$6,$7,$8,$9::date,$10,$11::time,$12::time,$13,$14,NOW(),NOW())
         RETURNING id`,
        [
          input.ownerUserId,
          input.collegeSubjectId.trim(),
          input.studySubjectId.trim(),
          slot.roomId,
          slot.scheduleTypeDb,
          input.termLabel.trim() || null,
          input.academicYear.trim() || null,
          slot.stageNum,
          input.examDate.trim(),
          mealN,
          input.startTime.trim(),
          input.endTime.trim(),
          slot.duration,
          input.notes.trim() || null,
        ]
      );
      insertedIds.push(String(ins.rows[0]?.id ?? ""));
    }
    await pool.query("COMMIT");
  } catch (err: unknown) {
    await pool.query("ROLLBACK");
    const msg = String((err as { message?: string }).message ?? "");
    return { ok: false, message: msg || "تعذر حفظ الجدول." };
  }

  const rows = await listCollegeExamSchedulesByOwner(input.ownerUserId);
  const out = insertedIds.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as CollegeExamScheduleRow[];
  if (out.length !== insertedIds.length) {
    return { ok: false, message: "تمت الإضافة لكن تعذر تحميل السجلات الجديدة." };
  }
  for (const id of insertedIds) {
    await writeScheduleAudit(input.ownerUserId, "EXAM_SCHEDULE_CREATED", id, {
      collegeSubjectId: input.collegeSubjectId.trim(),
      studySubjectId: input.studySubjectId.trim(),
      examDate: input.examDate.trim(),
      startTime: input.startTime.trim(),
      endTime: input.endTime.trim(),
      roomIds: validated.map((x) => x.roomId),
    });
  }
  return { ok: true, rows: out };
}

export async function updateCollegeExamSchedule(input: {
  id: string;
  ownerUserId: string;
  collegeSubjectId: string;
  studySubjectId: string;
  roomId: string;
  stageLevel: string;
  scheduleType: string;
  termLabel: string;
  academicYear: string;
  examDate: string;
  mealSlot: string;
  startTime: string;
  endTime: string;
  notes: string;
}): Promise<{ ok: true; row: CollegeExamScheduleRow } | { ok: false; message: string }> {
  if (!/^\d+$/.test(input.id.trim())) return { ok: false, message: "معرّف الإدخال غير صالح." };
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  const pool = getDbPool();

  const v = await validateExamScheduleSlot(pool, {
    ownerUserId: input.ownerUserId,
    collegeSubjectId: input.collegeSubjectId,
    studySubjectId: input.studySubjectId,
    roomId: input.roomId.trim(),
    stageLevel: input.stageLevel,
    scheduleType: input.scheduleType,
    termLabel: input.termLabel,
    academicYear: input.academicYear,
    examDate: input.examDate,
    mealSlot: input.mealSlot,
    startTime: input.startTime,
    endTime: input.endTime,
    excludeScheduleId: input.id.trim(),
  });
  if (!v.ok) return v;

  const mealN = normalizeExamMealSlot(input.mealSlot);
  const upd = await pool.query(
    `UPDATE college_exam_schedules
     SET college_subject_id = $1::bigint, study_subject_id = $2::bigint, room_id = $3::bigint,
         schedule_type = $4, term_label = $5, academic_year = $6, stage_level = $7, exam_date = $8::date,
         meal_slot = $9, start_time = $10::time, end_time = $11::time, duration_minutes = $12, notes = $13,
         workflow_status = 'APPROVED', updated_at = NOW()
     WHERE id = $14::bigint AND owner_user_id = $15
       AND UPPER(TRIM(workflow_status::text)) IN ('DRAFT','REJECTED','SUBMITTED','APPROVED')`,
    [
      input.collegeSubjectId.trim(),
      input.studySubjectId.trim(),
      input.roomId.trim(),
      v.scheduleTypeDb,
      input.termLabel.trim() || null,
      input.academicYear.trim() || null,
      v.stageNum,
      input.examDate.trim(),
      mealN,
      input.startTime.trim(),
      input.endTime.trim(),
      v.endMin - v.startMin,
      input.notes.trim() || null,
      input.id.trim(),
      input.ownerUserId,
    ]
  );
  if ((upd.rowCount ?? 0) === 0) return { ok: false, message: "الإدخال غير موجود أو لا يمكن تعديله." };
  const rows = await listCollegeExamSchedulesByOwner(input.ownerUserId);
  const row = rows.find((r) => r.id === input.id.trim());
  if (!row) return { ok: false, message: "تم التحديث لكن تعذر تحميل السجل." };
  await writeScheduleAudit(input.ownerUserId, "EXAM_SCHEDULE_UPDATED", input.id.trim(), {
    collegeSubjectId: input.collegeSubjectId.trim(),
    studySubjectId: input.studySubjectId.trim(),
    examDate: input.examDate.trim(),
    startTime: input.startTime.trim(),
    endTime: input.endTime.trim(),
    roomId: input.roomId.trim(),
  });
  return { ok: true, row };
}

export async function deleteCollegeExamSchedule(input: {
  id: string;
  ownerUserId: string;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  if (!/^\d+$/.test(input.id.trim())) return { ok: false, message: "معرّف الإدخال غير صالح." };
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query(`DELETE FROM college_exam_schedules WHERE id = $1 AND owner_user_id = $2`, [
    input.id.trim(),
    input.ownerUserId,
  ]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "الإدخال غير موجود أو لا يمكن حذفه." };
  await writeScheduleAudit(input.ownerUserId, "EXAM_SCHEDULE_DELETED", input.id.trim(), {});
  return { ok: true, id: input.id.trim() };
}

export async function reviewCollegeExamScheduleContext(input: {
  reviewerUserId: string;
  ownerUserId: string;
  collegeSubjectId: string;
  scheduleType: string;
  termLabel: string;
  academicYear: string;
  decision: "APPROVED" | "REJECTED";
  reviewNote?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  if (!/^\d+$/.test(input.collegeSubjectId.trim())) return { ok: false, message: "القسم/الفرع غير صالح." };
  const pool = getDbPool();
  const status = input.decision === "APPROVED" ? "APPROVED" : "REJECTED";
  const r = await pool.query(
    `UPDATE college_exam_schedules
     SET workflow_status = $1, updated_at = NOW()
     WHERE owner_user_id = $2
       AND college_subject_id = $3
       AND schedule_type = $4
       AND COALESCE(term_label, '') = COALESCE($5, '')
       AND COALESCE(academic_year, '') = COALESCE($6, '')
       AND (
         ($1::text = 'APPROVED' AND UPPER(TRIM(workflow_status::text)) = 'SUBMITTED')
         OR ($1::text = 'REJECTED' AND UPPER(TRIM(workflow_status::text)) IN ('SUBMITTED', 'APPROVED'))
       )`,
    [
      status,
      input.ownerUserId,
      input.collegeSubjectId.trim(),
      input.scheduleType === "SEMESTER" ? "SEMESTER" : "FINAL",
      input.termLabel.trim() || null,
      input.academicYear.trim() || null,
    ]
  );
  if ((r.rowCount ?? 0) === 0) {
    return {
      ok: false,
      message:
        status === "APPROVED"
          ? "لا توجد إدخالات بحالة «مرفوع للمتابعة» لاعتمادها (الجداول المكتملة تُعتمد تلقائياً من الكلية)."
          : "لا توجد إدخالات معتمدة أو مرفوعة لرفضها ضمن هذا السياق.",
    };
  }
  await writeScheduleAudit(input.reviewerUserId, `EXAM_SCHEDULE_${status}`, null, {
    ownerUserId: input.ownerUserId,
    collegeSubjectId: input.collegeSubjectId.trim(),
    scheduleType: input.scheduleType === "SEMESTER" ? "SEMESTER" : "FINAL",
    termLabel: input.termLabel.trim() || null,
    academicYear: input.academicYear.trim() || null,
    reviewNote: input.reviewNote?.trim() || null,
  });
  return { ok: true };
}
