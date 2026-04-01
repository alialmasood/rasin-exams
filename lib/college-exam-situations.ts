import { mergeAbsenceNamesByShift } from "@/lib/capacity-by-shift-ar";
import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";
import { canUploadSituationInExamWindow } from "@/lib/exam-situation-window";
import type { CollegeExamScheduleRow } from "@/lib/college-exam-schedules";
import type { StudyType } from "@/lib/college-study-subjects";
import type { DeanSituationStatus, UploadStatusTableRow } from "@/lib/upload-status-display";

export type { DeanSituationStatus, UploadStatusListItem, UploadStatusTableRow } from "@/lib/upload-status-display";
export { buildUploadStatusListItems } from "@/lib/upload-status-display";

function normalizeDean(s: string | null | undefined): DeanSituationStatus {
  const v = (s ?? "NONE").toUpperCase();
  if (v === "APPROVED") return "APPROVED";
  if (v === "REJECTED") return "REJECTED";
  if (v === "PENDING") return "PENDING";
  return "NONE";
}

function normalizeStudyTypeDb(v: string): StudyType {
  const t = v?.trim().toUpperCase();
  if (t === "SEMESTER") return "SEMESTER";
  if (t === "COURSES") return "COURSES";
  if (t === "BOLOGNA") return "BOLOGNA";
  return "ANNUAL";
}

function normalizeWorkflowStatusDb(s: string | null | undefined): CollegeExamScheduleRow["workflow_status"] {
  const v = String(s ?? "DRAFT")
    .trim()
    .toUpperCase();
  if (v === "APPROVED") return "APPROVED";
  if (v === "REJECTED") return "REJECTED";
  if (v === "SUBMITTED") return "SUBMITTED";
  return "DRAFT";
}

/** مطابقة السعة + عند غياب > 0 يجب أن يكون حقل الأسماء غير فارغ (كما في واجهة رفع الموقف). */
function isSituationAttendanceDatasetComplete(
  capacity: number,
  attendance: number,
  absence: number,
  absenceNamesRaw: string | null | undefined
): boolean {
  if (capacity <= 0) return false;
  if (attendance + absence !== capacity) return false;
  if (absence > 0) {
    if (String(absenceNamesRaw ?? "").trim().length === 0) return false;
  }
  return true;
}

/** اكتمال الحضور/الغياب مع تفصيل صباحي ومسائي (يتوافق مع إدارة القاعات). */
function isSituationShiftAttendanceComplete(
  capM: number,
  capE: number,
  attM: number,
  absM: number,
  attE: number,
  absE: number,
  namesM: string | null | undefined,
  namesE: string | null | undefined
): boolean {
  const cM = Math.max(0, Math.floor(Number(capM) || 0));
  const cE = Math.max(0, Math.floor(Number(capE) || 0));
  if (cM + cE <= 0) return false;
  if (cM > 0) {
    if (attM + absM !== cM) return false;
    if (absM > 0 && String(namesM ?? "").trim().length === 0) return false;
  } else if (attM !== 0 || absM !== 0) {
    return false;
  }
  if (cE > 0) {
    if (attE + absE !== cE) return false;
    if (absE > 0 && String(namesE ?? "").trim().length === 0) return false;
  } else if (attE !== 0 || absE !== 0) {
    return false;
  }
  return true;
}

export async function listOfficialExamSituationsForOwner(ownerUserId: string): Promise<UploadStatusTableRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    schedule_id: string | number;
    college_subject_id: string;
    study_subject_id: string;
    exam_date: string;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    schedule_type: string;
    workflow_status: string;
    room_id: string | number;
    room_name: string;
    capacity_total: number;
    capacity_morning: number;
    capacity_evening: number;
    attendance_count: number;
    absence_count: number;
    attendance_morning: number;
    absence_morning: number;
    attendance_evening: number;
    absence_evening: number;
    absence_names_morning: string | null;
    absence_names_evening: string | null;
    subject_name: string;
    study_type: string;
    branch_name: string;
    academic_year: string | null;
    stage_level: number;
    head_submitted_at: Date | null;
    dean_status: string | null;
    dean_reviewed_at: Date | null;
    absence_names: string | null;
  }>(
    `SELECT e.id AS schedule_id, e.college_subject_id::text AS college_subject_id, e.study_subject_id::text AS study_subject_id,
            e.exam_date::text, e.start_time::text, e.end_time::text, e.duration_minutes,
            e.schedule_type, COALESCE(e.workflow_status, 'DRAFT') AS workflow_status,
            r.id AS room_id, r.room_name,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.capacity_total
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.capacity_total_2, 0)
              ELSE r.capacity_total
            END AS capacity_total,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.capacity_morning
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.capacity_morning_2, 0)
              ELSE r.capacity_morning
            END AS capacity_morning,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.capacity_evening
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.capacity_evening_2, 0)
              ELSE r.capacity_evening
            END AS capacity_evening,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.attendance_count
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.attendance_count_2, 0)
              ELSE r.attendance_count
            END AS attendance_count,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_count
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.absence_count_2, 0)
              ELSE r.absence_count
            END AS absence_count,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_names
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN r.absence_names_2
              ELSE r.absence_names
            END AS absence_names,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.attendance_morning
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.attendance_morning_2, 0)
              ELSE r.attendance_morning
            END AS attendance_morning,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_morning
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.absence_morning_2, 0)
              ELSE r.absence_morning
            END AS absence_morning,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.attendance_evening
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.attendance_evening_2, 0)
              ELSE r.attendance_evening
            END AS attendance_evening,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_evening
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.absence_evening_2, 0)
              ELSE r.absence_evening
            END AS absence_evening,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_names_morning
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN r.absence_names_morning_2
              ELSE r.absence_names_morning
            END AS absence_names_morning,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_names_evening
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN r.absence_names_evening_2
              ELSE r.absence_names_evening
            END AS absence_names_evening,
            s.subject_name, COALESCE(s.study_type, 'ANNUAL') AS study_type,
            c.branch_name, e.academic_year, e.stage_level,
            rep.head_submitted_at, rep.dean_status, rep.dean_reviewed_at
     FROM college_exam_schedules e
     INNER JOIN college_subjects c ON c.id = e.college_subject_id
     INNER JOIN college_study_subjects s ON s.id = e.study_subject_id
     INNER JOIN college_exam_rooms r ON r.id = e.room_id
     LEFT JOIN college_exam_situation_reports rep
            ON rep.exam_schedule_id = e.id AND rep.owner_user_id = e.owner_user_id
     WHERE e.owner_user_id = $1
     ORDER BY e.exam_date ASC, e.start_time ASC, e.created_at ASC`,
    [ownerUserId]
  );
  return r.rows.map((row) => {
    const dean = normalizeDean(row.dean_status);
    const cap = Number(row.capacity_total ?? 0);
    const capM = Number(row.capacity_morning ?? 0);
    const capE = Number(row.capacity_evening ?? 0);
    const att = Number(row.attendance_count ?? 0);
    const abs = Number(row.absence_count ?? 0);
    const attM = Number(row.attendance_morning ?? 0);
    const absM = Number(row.absence_morning ?? 0);
    const attE = Number(row.attendance_evening ?? 0);
    const absE = Number(row.absence_evening ?? 0);
    const uploaded = Boolean(row.head_submitted_at);
    const useShift = capM > 0 || capE > 0;
    const complete = useShift
      ? isSituationShiftAttendanceComplete(
          capM,
          capE,
          attM,
          absM,
          attE,
          absE,
          row.absence_names_morning,
          row.absence_names_evening
        )
      : isSituationAttendanceDatasetComplete(cap, att, abs, row.absence_names);
    return {
      schedule_id: String(row.schedule_id),
      college_subject_id: String(row.college_subject_id),
      study_subject_id: String(row.study_subject_id),
      exam_date: row.exam_date,
      start_time: row.start_time.slice(0, 5),
      end_time: row.end_time.slice(0, 5),
      duration_minutes: Number(row.duration_minutes ?? 0),
      schedule_type: row.schedule_type === "SEMESTER" ? "SEMESTER" : "FINAL",
      workflow_status: normalizeWorkflowStatusDb(row.workflow_status),
      room_id: String(row.room_id),
      room_name: row.room_name,
      capacity_total: cap,
      attendance_count: att,
      absence_count: abs,
      subject_name: row.subject_name,
      study_type: normalizeStudyTypeDb(row.study_type),
      branch_name: row.branch_name,
      academic_year: row.academic_year,
      stage_level: Number(row.stage_level ?? 1),
      head_submitted_at: row.head_submitted_at,
      dean_status: dean,
      dean_reviewed_at: row.dean_reviewed_at,
      is_uploaded: uploaded,
      is_complete: Boolean(complete),
    };
  });
}

/** صف جدول المتابعة مرتبط بجلسة مجدولة + college_exam_situation_reports. */
export type StatusFollowupScheduleRow = {
  kind: "schedule";
  schedule_id: string;
  exam_date: string;
  subject_name: string;
  stage_level: number;
  branch_name: string;
  workflow_status: CollegeExamScheduleRow["workflow_status"];
  dean_status: DeanSituationStatus;
  head_submitted_at_iso: string | null;
  dean_reviewed_at_iso: string | null;
  is_complete: boolean;
};

/** صف جدول المتابعة من نموذج «رفع الموقف الامتحاني» المحفوظ في college_situation_form_submissions. */
export type StatusFollowupFormRow = {
  kind: "form";
  form_submission_id: string;
  exam_date: string;
  subject_name: string;
  stage_display: string;
  branch_name: string;
  submitted_at_iso: string;
};

export type StatusFollowupRow = StatusFollowupScheduleRow | StatusFollowupFormRow;

/** @deprecated استخدم StatusFollowupScheduleRow */
export type StatusFollowupTableRow = StatusFollowupScheduleRow;

/** مواقف رُفع موقفها من رئيس القسم — تظهر في «متابعة المواقف». مرتبة من الأحدث رفعاً. */
export async function listUploadedExamSituationsForFollowup(
  ownerUserId: string
): Promise<StatusFollowupScheduleRow[]> {
  const rows = await listOfficialExamSituationsForOwner(ownerUserId);
  return rows
    .filter((r) => r.is_uploaded)
    .sort((a, b) => (b.head_submitted_at?.getTime() ?? 0) - (a.head_submitted_at?.getTime() ?? 0))
    .map((r) => ({
      kind: "schedule" as const,
      schedule_id: r.schedule_id,
      exam_date: r.exam_date,
      subject_name: r.subject_name,
      stage_level: r.stage_level,
      branch_name: r.branch_name,
      workflow_status: r.workflow_status,
      dean_status: r.dean_status,
      head_submitted_at_iso: r.head_submitted_at?.toISOString() ?? null,
      dean_reviewed_at_iso: r.dean_reviewed_at?.toISOString() ?? null,
      is_complete: r.is_complete && r.dean_status === "APPROVED",
    }));
}

export type ExamSituationDetail = UploadStatusTableRow & {
  branch_head_name: string;
  supervisor_name: string;
  invigilators: string;
  absence_names: string;
  notes: string | null;
  /** سعة الدوام الصباحي للمادة المطابقة لهذا الجدول (من college_exam_rooms) */
  capacity_morning: number;
  /** سعة الدوام المسائي للمادة المطابقة لهذا الجدول */
  capacity_evening: number;
  attendance_morning: number;
  absence_morning: number;
  attendance_evening: number;
  absence_evening: number;
  absence_names_morning: string;
  absence_names_evening: string;
};

type ExamSituationDetailDbRow = {
  schedule_id: string | number;
  college_subject_id: string;
  schedule_study_subject_id: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  schedule_type: string;
  workflow_status: string;
  room_id: string | number;
  room_name: string;
  capacity_total: number;
  capacity_morning: number;
  capacity_evening: number;
  attendance_count: number;
  absence_count: number;
  absence_names: string | null;
  attendance_morning: number;
  absence_morning: number;
  attendance_evening: number;
  absence_evening: number;
  absence_names_morning: string | null;
  absence_names_evening: string | null;
  supervisor_name: string;
  invigilators: string | null;
  subject_name: string;
  study_type: string;
  branch_name: string;
  branch_head_name: string;
  academic_year: string | null;
  stage_level: number;
  head_submitted_at: Date | null;
  dean_status: string | null;
  dean_reviewed_at: Date | null;
  notes: string | null;
};

/** SELECT + JOINs لصف تفاصيل الموقف — يُكمَل بشرط WHERE. */
const EXAM_SITUATION_DETAIL_SQL_BASE = `
    SELECT e.id AS schedule_id, e.college_subject_id::text AS college_subject_id,
            e.study_subject_id::text AS schedule_study_subject_id,
            e.exam_date::text, e.start_time::text, e.end_time::text, e.duration_minutes,
            e.schedule_type, COALESCE(e.workflow_status, 'DRAFT') AS workflow_status,
            r.id AS room_id, r.room_name,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.capacity_total
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.capacity_total_2, 0)
              ELSE r.capacity_total
            END AS capacity_total,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.capacity_morning
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.capacity_morning_2, 0)
              ELSE r.capacity_morning
            END AS capacity_morning,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.capacity_evening
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.capacity_evening_2, 0)
              ELSE r.capacity_evening
            END AS capacity_evening,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.attendance_count
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.attendance_count_2, 0)
              ELSE r.attendance_count
            END AS attendance_count,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_count
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.absence_count_2, 0)
              ELSE r.absence_count
            END AS absence_count,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_names
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN r.absence_names_2
              ELSE r.absence_names
            END AS absence_names,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.attendance_morning
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.attendance_morning_2, 0)
              ELSE r.attendance_morning
            END AS attendance_morning,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_morning
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.absence_morning_2, 0)
              ELSE r.absence_morning
            END AS absence_morning,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.attendance_evening
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.attendance_evening_2, 0)
              ELSE r.attendance_evening
            END AS attendance_evening,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_evening
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.absence_evening_2, 0)
              ELSE r.absence_evening
            END AS absence_evening,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_names_morning
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN r.absence_names_morning_2
              ELSE r.absence_names_morning
            END AS absence_names_morning,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_names_evening
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN r.absence_names_evening_2
              ELSE r.absence_names_evening
            END AS absence_names_evening,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.supervisor_name
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(NULLIF(TRIM(r.supervisor_name_2), ''), r.supervisor_name)
              ELSE r.supervisor_name
            END AS supervisor_name,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.invigilators
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(NULLIF(TRIM(r.invigilators_2), ''), r.invigilators)
              ELSE r.invigilators
            END AS invigilators,
            s.subject_name, COALESCE(s.study_type, 'ANNUAL') AS study_type,
            c.branch_name, c.branch_head_name, e.academic_year, e.stage_level,
            rep.head_submitted_at, rep.dean_status, rep.dean_reviewed_at,
            e.notes
     FROM college_exam_schedules e
     INNER JOIN college_subjects c ON c.id = e.college_subject_id
     INNER JOIN college_study_subjects s ON s.id = e.study_subject_id
     INNER JOIN college_exam_rooms r ON r.id = e.room_id
     LEFT JOIN college_exam_situation_reports rep
            ON rep.exam_schedule_id = e.id AND rep.owner_user_id = e.owner_user_id`;

function mapDbRowToExamSituationDetail(row: ExamSituationDetailDbRow): ExamSituationDetail {
  const dean = normalizeDean(row.dean_status);
  const cap = Number(row.capacity_total ?? 0);
  const capM = Number(row.capacity_morning ?? 0);
  const capE = Number(row.capacity_evening ?? 0);
  const att = Number(row.attendance_count ?? 0);
  const abs = Number(row.absence_count ?? 0);
  const attM = Number(row.attendance_morning ?? 0);
  const absM = Number(row.absence_morning ?? 0);
  const attE = Number(row.attendance_evening ?? 0);
  const absE = Number(row.absence_evening ?? 0);
  const uploaded = Boolean(row.head_submitted_at);
  const useShift = capM > 0 || capE > 0;
  const complete = useShift
    ? isSituationShiftAttendanceComplete(
        capM,
        capE,
        attM,
        absM,
        attE,
        absE,
        row.absence_names_morning,
        row.absence_names_evening
      )
    : isSituationAttendanceDatasetComplete(cap, att, abs, row.absence_names);

  return {
    schedule_id: String(row.schedule_id),
    college_subject_id: String(row.college_subject_id ?? ""),
    study_subject_id: String(row.schedule_study_subject_id),
    exam_date: row.exam_date,
    start_time: row.start_time.slice(0, 5),
    end_time: row.end_time.slice(0, 5),
    duration_minutes: Number(row.duration_minutes ?? 0),
    schedule_type: row.schedule_type === "SEMESTER" ? "SEMESTER" : "FINAL",
    workflow_status: normalizeWorkflowStatusDb(row.workflow_status),
    room_id: String(row.room_id),
    room_name: row.room_name,
    capacity_total: cap,
    capacity_morning: capM,
    capacity_evening: capE,
    attendance_count: att,
    absence_count: abs,
    attendance_morning: attM,
    absence_morning: absM,
    attendance_evening: attE,
    absence_evening: absE,
    absence_names_morning: row.absence_names_morning ?? "",
    absence_names_evening: row.absence_names_evening ?? "",
    subject_name: row.subject_name,
    study_type: normalizeStudyTypeDb(row.study_type),
    branch_name: row.branch_name,
    academic_year: row.academic_year,
    stage_level: Number(row.stage_level ?? 1),
    head_submitted_at: row.head_submitted_at,
    dean_status: dean,
    dean_reviewed_at: row.dean_reviewed_at,
    is_uploaded: uploaded,
    is_complete: Boolean(complete),
    branch_head_name: row.branch_head_name,
    supervisor_name: row.supervisor_name,
    invigilators: row.invigilators ?? "",
    absence_names: row.absence_names ?? "",
    notes: row.notes,
  };
}

export async function getExamSituationDetailForOwner(
  ownerUserId: string,
  scheduleId: string
): Promise<ExamSituationDetail | null> {
  if (!isDatabaseConfigured()) return null;
  if (!/^\d+$/.test(scheduleId.trim())) return null;
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<ExamSituationDetailDbRow>(
    `${EXAM_SITUATION_DETAIL_SQL_BASE}
     WHERE e.owner_user_id = $1 AND e.id = $2::bigint
     LIMIT 1`,
    [ownerUserId, scheduleId.trim()]
  );
  const row = r.rows[0];
  if (!row) return null;
  return mapDbRowToExamSituationDetail(row);
}

export type ExamSituationAggregates = {
  capacity_total: number;
  capacity_morning: number;
  capacity_evening: number;
  attendance_count: number;
  absence_count: number;
  attendance_morning: number;
  absence_morning: number;
  attendance_evening: number;
  absence_evening: number;
  /** أسماء غياب مدمجة من كل القاعات، مفرّزة أبجدياً */
  absence_names_sorted: string;
};

export type ExamSituationBundle = {
  sessions: ExamSituationDetail[];
  /** معرّف الجدول المفتوح في الرابط */
  active_schedule_id: string;
  aggregates: ExamSituationAggregates;
};

export function sortUniqueAbsenceNamesAr(raw: string): string {
  const tokens = raw
    .split(/[,،;|\n\r]+/u)
    .map((t) => t.trim())
    .filter(Boolean);
  const unique = [...new Set(tokens)];
  unique.sort((a, b) => a.localeCompare(b, "ar-IQ"));
  return unique.join("، ");
}

function computeExamSituationAggregates(sessions: ExamSituationDetail[]): ExamSituationAggregates {
  let capacity_total = 0;
  let capacity_morning = 0;
  let capacity_evening = 0;
  let attendance_count = 0;
  let absence_count = 0;
  let attendance_morning = 0;
  let absence_morning = 0;
  let attendance_evening = 0;
  let absence_evening = 0;
  const nameChunks: string[] = [];
  for (const s of sessions) {
    capacity_total += s.capacity_total;
    capacity_morning += s.capacity_morning;
    capacity_evening += s.capacity_evening;
    attendance_count += s.attendance_count;
    absence_count += s.absence_count;
    attendance_morning += s.attendance_morning;
    absence_morning += s.absence_morning;
    attendance_evening += s.attendance_evening;
    absence_evening += s.absence_evening;
    const merged = mergeAbsenceNamesByShift(s.absence_names_morning, s.absence_names_evening);
    const src = merged.trim() || (s.absence_names ?? "").trim();
    if (src) nameChunks.push(src);
  }
  return {
    capacity_total,
    capacity_morning,
    capacity_evening,
    attendance_count,
    absence_count,
    attendance_morning,
    absence_morning,
    attendance_evening,
    absence_evening,
    absence_names_sorted: sortUniqueAbsenceNamesAr(nameChunks.join("\n")),
  };
}

export async function getExamSituationBundleForOwner(
  ownerUserId: string,
  scheduleId: string
): Promise<ExamSituationBundle | null> {
  if (!isDatabaseConfigured()) return null;
  if (!/^\d+$/.test(scheduleId.trim())) return null;
  await ensureCoreSchema();
  const pool = getDbPool();
  const prim = await pool.query<ExamSituationDetailDbRow>(
    `${EXAM_SITUATION_DETAIL_SQL_BASE}
     WHERE e.owner_user_id = $1 AND e.id = $2::bigint
     LIMIT 1`,
    [ownerUserId, scheduleId.trim()]
  );
  const p = prim.rows[0];
  if (!p) return null;

  const st = String(p.schedule_type ?? "FINAL").toUpperCase() === "SEMESTER" ? "SEMESTER" : "FINAL";
  const sib = await pool.query<{ id: string }>(
    `SELECT e.id::text FROM college_exam_schedules e
     WHERE e.owner_user_id = $1
       AND e.college_subject_id::text = $2
       AND e.study_subject_id::text = $3
       AND e.stage_level = $4
       AND e.exam_date::text = $5
       AND e.start_time = $6::time
       AND e.end_time = $7::time
       AND e.schedule_type = $8
     ORDER BY e.id ASC`,
    [
      ownerUserId,
      String(p.college_subject_id ?? ""),
      String(p.schedule_study_subject_id ?? ""),
      Number(p.stage_level ?? 1),
      String(p.exam_date ?? ""),
      p.start_time,
      p.end_time,
      st,
    ]
  );
  const ids = sib.rows.map((r) => r.id);

  const full = await pool.query<ExamSituationDetailDbRow>(
    `${EXAM_SITUATION_DETAIL_SQL_BASE}
     WHERE e.owner_user_id = $1 AND e.id = ANY($2::bigint[])
     ORDER BY r.room_name ASC NULLS LAST, e.id ASC`,
    [ownerUserId, ids]
  );
  const sessions = full.rows.map(mapDbRowToExamSituationDetail);
  const aggregates = computeExamSituationAggregates(sessions);
  return { sessions, active_schedule_id: scheduleId.trim(), aggregates };
}

/** جلسات يوم امتحاني مرفوع موقفها (للتقرير النهائي اليومي). */
export async function listUploadedExamSituationDetailsForOwnerExamDate(
  ownerUserId: string,
  examDate: string
): Promise<ExamSituationDetail[]> {
  if (!isDatabaseConfigured()) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate.trim())) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<ExamSituationDetailDbRow>(
    `${EXAM_SITUATION_DETAIL_SQL_BASE}
     WHERE e.owner_user_id = $1
       AND e.exam_date = $2::date
       AND UPPER(TRIM(COALESCE(e.workflow_status::text, 'DRAFT'))) IN ('SUBMITTED', 'APPROVED')
       AND rep.head_submitted_at IS NOT NULL
     ORDER BY e.start_time ASC, e.created_at ASC`,
    [ownerUserId, examDate.trim()]
  );
  return r.rows.map(mapDbRowToExamSituationDetail);
}

export type ExamDayUploadSummary = {
  exam_date: string;
  total_sessions: number;
  uploaded_sessions: number;
};

/** عدد جلسات كل يوم (المرسلة/المعتمدة في الجدول) مقابل المرفوع موقفها. */
export async function listExamDayUploadSummariesForOwner(ownerUserId: string): Promise<ExamDayUploadSummary[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{ exam_date: string; total_sessions: string; uploaded_sessions: string }>(
    `SELECT e.exam_date::text AS exam_date,
            COUNT(*)::text AS total_sessions,
            SUM(CASE WHEN rep.head_submitted_at IS NOT NULL THEN 1 ELSE 0 END)::text AS uploaded_sessions
     FROM college_exam_schedules e
     LEFT JOIN college_exam_situation_reports rep
            ON rep.exam_schedule_id = e.id AND rep.owner_user_id = e.owner_user_id
     WHERE e.owner_user_id = $1
       AND UPPER(TRIM(COALESCE(e.workflow_status::text, 'DRAFT'))) IN ('SUBMITTED', 'APPROVED')
     GROUP BY e.exam_date
     ORDER BY e.exam_date ASC`,
    [ownerUserId]
  );
  return r.rows.map((row) => ({
    exam_date: row.exam_date,
    total_sessions: Number(row.total_sessions ?? 0),
    uploaded_sessions: Number(row.uploaded_sessions ?? 0),
  }));
}

export async function submitHeadExamSituation(input: {
  ownerUserId: string;
  scheduleId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  if (!/^\d+$/.test(input.scheduleId.trim())) return { ok: false, message: "معرّف الجدول غير صالح." };
  const pool = getDbPool();
  const s = await pool.query<{
    exam_date: string;
    start_time: string;
    end_time: string;
  }>(
    `SELECT e.exam_date::text, e.start_time::text, e.end_time::text
     FROM college_exam_schedules e
     WHERE e.owner_user_id = $1 AND e.id = $2::bigint
       AND UPPER(TRIM(COALESCE(e.workflow_status::text, 'DRAFT'))) IN ('SUBMITTED','APPROVED')
     LIMIT 1`,
    [input.ownerUserId, input.scheduleId.trim()]
  );
  if ((s.rowCount ?? 0) === 0) {
    return {
      ok: false,
      message:
        "لا يمكن تأكيد رفع الموقف: الجدول مسودة أو مرفوض. أرسل الجدول للمتابعة أو اعتمده من صفحة «الجداول الامتحانية» ثم أعد المحاولة.",
    };
  }
  const ex = s.rows[0]!;
  const st = ex.start_time.slice(0, 5);
  const en = ex.end_time.slice(0, 5);
  if (!canUploadSituationInExamWindow(ex.exam_date, st, en)) {
    return {
      ok: false,
      message: "لا يُسمح برفع الموقف إلا خلال نافذة الامتحان (من 30 دقيقة بعد البداية حتى النهاية، بتوقيت بغداد).",
    };
  }
  const deanChk = await pool.query<{ dean_status: string | null }>(
    `SELECT dean_status FROM college_exam_situation_reports
     WHERE owner_user_id = $1 AND exam_schedule_id = $2::bigint`,
    [input.ownerUserId, input.scheduleId.trim()]
  );
  const d0 = normalizeDean(deanChk.rows[0]?.dean_status);
  if ((deanChk.rowCount ?? 0) === 0 || d0 !== "APPROVED") {
    return {
      ok: false,
      message:
        "يجب اعتماد الموقف من العميد أو المعاون العلمي أولاً (زر «اعتماد الموقف») ثم يُفعّل «تأكيد رفع الموقف».",
    };
  }
  await pool.query(
    `INSERT INTO college_exam_situation_reports
       (owner_user_id, exam_schedule_id, head_submitted_at, dean_status, updated_at)
     VALUES ($1, $2::bigint, NOW(), 'APPROVED', NOW())
     ON CONFLICT (owner_user_id, exam_schedule_id)
     DO UPDATE SET
       head_submitted_at = NOW(),
       dean_status = CASE
         WHEN college_exam_situation_reports.dean_status = 'APPROVED' THEN 'APPROVED'
         ELSE 'PENDING'
       END,
       updated_at = NOW()`,
    [input.ownerUserId, input.scheduleId.trim()]
  );
  return { ok: true };
}

export async function approveDeanExamSituation(input: {
  ownerUserId: string;
  scheduleId: string;
  deanNote?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  if (!/^\d+$/.test(input.scheduleId.trim())) return { ok: false, message: "معرّف الجدول غير صالح." };
  const detail = await getExamSituationDetailForOwner(input.ownerUserId, input.scheduleId.trim());
  if (!detail) {
    return { ok: false, message: "لا يمكن الوصول لهذا الجدول أو المعرف غير صالح." };
  }
  if (detail.workflow_status !== "SUBMITTED" && detail.workflow_status !== "APPROVED") {
    return {
      ok: false,
      message:
        "لا يمكن الاعتماد إلا للجداول «مرفوعة للمتابعة» أو «معتمدة» في صفحة الجداول الامتحانية.",
    };
  }
  if (!detail.is_complete) {
    return {
      ok: false,
      message: "أكمل بيانات الحضور والغياب وتطابقها مع سعة القاعة قبل اعتماد الموقف.",
    };
  }
  const pool = getDbPool();
  const note = (input.deanNote ?? "").trim();
  await pool.query(
    `INSERT INTO college_exam_situation_reports
       (owner_user_id, exam_schedule_id, dean_status, dean_reviewed_at, dean_note, updated_at)
     VALUES ($1, $2::bigint, 'APPROVED', NOW(), NULLIF(TRIM($3), ''), NOW())
     ON CONFLICT (owner_user_id, exam_schedule_id)
     DO UPDATE SET
       dean_status = 'APPROVED',
       dean_reviewed_at = NOW(),
       dean_note = COALESCE(NULLIF(TRIM($3), ''), college_exam_situation_reports.dean_note),
       updated_at = NOW()`,
    [input.ownerUserId, input.scheduleId.trim(), note]
  );
  return { ok: true };
}

/** يزيل سجل رفع الموقف من college_exam_situation_reports دون حذف جدول الجلسة. */
export async function deleteExamSituationReportForOwner(input: {
  ownerUserId: string;
  scheduleId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  const sid = input.scheduleId.trim();
  if (!/^\d+$/.test(sid)) return { ok: false, message: "معرّف الجدول غير صالح." };
  const pool = getDbPool();
  const r = await pool.query(
    `DELETE FROM college_exam_situation_reports
     WHERE owner_user_id = $1 AND exam_schedule_id = $2::bigint
     RETURNING id`,
    [input.ownerUserId, sid]
  );
  if ((r.rowCount ?? 0) === 0) {
    return { ok: false, message: "لا يوجد موقف مرفوع لهذه الجلسة أو ليس لديك صلاحية." };
  }
  return { ok: true };
}