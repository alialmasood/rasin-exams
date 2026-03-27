import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";
import { canUploadSituationInExamWindow } from "@/lib/exam-situation-window";
import type { CollegeExamScheduleRow } from "@/lib/college-exam-schedules";
import type { StudyType } from "@/lib/college-study-subjects";

export type DeanSituationStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

export type UploadStatusTableRow = {
  schedule_id: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  schedule_type: "FINAL" | "SEMESTER";
  workflow_status: CollegeExamScheduleRow["workflow_status"];
  room_id: string;
  room_name: string;
  capacity_total: number;
  attendance_count: number;
  absence_count: number;
  subject_name: string;
  study_type: StudyType;
  branch_name: string;
  academic_year: string | null;
  stage_level: number;
  head_submitted_at: Date | null;
  dean_status: DeanSituationStatus;
  dean_reviewed_at: Date | null;
  /** مرفوع من رئيس القسم */
  is_uploaded: boolean;
  /** مكتمل: اعتماد العميد، أو تطابق الحضور+الغياب مع السعة مع إدراج أسماء الغياب عند وجود غياب */
  is_complete: boolean;
};

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

export async function listOfficialExamSituationsForOwner(ownerUserId: string): Promise<UploadStatusTableRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    schedule_id: string | number;
    exam_date: string;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    schedule_type: string;
    workflow_status: string;
    room_id: string | number;
    room_name: string;
    capacity_total: number;
    attendance_count: number;
    absence_count: number;
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
    `SELECT e.id AS schedule_id, e.exam_date::text, e.start_time::text, e.end_time::text, e.duration_minutes,
            e.schedule_type, COALESCE(e.workflow_status, 'DRAFT') AS workflow_status,
            r.id AS room_id, r.room_name,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.capacity_total
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.capacity_total_2, 0)
              ELSE r.capacity_total
            END AS capacity_total,
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
    const att = Number(row.attendance_count ?? 0);
    const abs = Number(row.absence_count ?? 0);
    const uploaded = Boolean(row.head_submitted_at);
    const complete =
      dean === "APPROVED" || isSituationAttendanceDatasetComplete(cap, att, abs, row.absence_names);
    return {
      schedule_id: String(row.schedule_id),
      exam_date: row.exam_date,
      start_time: row.start_time.slice(0, 5),
      end_time: row.end_time.slice(0, 5),
      duration_minutes: Number(row.duration_minutes ?? 0),
      schedule_type: row.schedule_type === "SEMESTER" ? "SEMESTER" : "FINAL",
      workflow_status:
        row.workflow_status === "APPROVED"
          ? "APPROVED"
          : row.workflow_status === "REJECTED"
            ? "REJECTED"
            : row.workflow_status === "SUBMITTED"
              ? "SUBMITTED"
              : "DRAFT",
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

export type ExamSituationDetail = UploadStatusTableRow & {
  study_subject_id: string;
  branch_head_name: string;
  supervisor_name: string;
  invigilators: string;
  absence_names: string;
  notes: string | null;
};

export async function getExamSituationDetailForOwner(
  ownerUserId: string,
  scheduleId: string
): Promise<ExamSituationDetail | null> {
  if (!isDatabaseConfigured()) return null;
  if (!/^\d+$/.test(scheduleId.trim())) return null;
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    schedule_id: string | number;
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
    attendance_count: number;
    absence_count: number;
    absence_names: string | null;
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
  }>(
    `SELECT e.id AS schedule_id, e.study_subject_id::text AS schedule_study_subject_id,
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
            ON rep.exam_schedule_id = e.id AND rep.owner_user_id = e.owner_user_id
     WHERE e.owner_user_id = $1 AND e.id = $2
     LIMIT 1`,
    [ownerUserId, scheduleId.trim()]
  );
  const row = r.rows[0];
  if (!row) return null;
  const dean = normalizeDean(row.dean_status);
  const cap = Number(row.capacity_total ?? 0);
  const att = Number(row.attendance_count ?? 0);
  const abs = Number(row.absence_count ?? 0);
  const uploaded = Boolean(row.head_submitted_at);
  const complete =
    dean === "APPROVED" || isSituationAttendanceDatasetComplete(cap, att, abs, row.absence_names);

  return {
    schedule_id: String(row.schedule_id),
    study_subject_id: String(row.schedule_study_subject_id),
    exam_date: row.exam_date,
    start_time: row.start_time.slice(0, 5),
    end_time: row.end_time.slice(0, 5),
    duration_minutes: Number(row.duration_minutes ?? 0),
    schedule_type: row.schedule_type === "SEMESTER" ? "SEMESTER" : "FINAL",
    workflow_status:
      row.workflow_status === "APPROVED"
        ? "APPROVED"
        : row.workflow_status === "REJECTED"
          ? "REJECTED"
          : row.workflow_status === "SUBMITTED"
            ? "SUBMITTED"
            : "DRAFT",
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
    branch_head_name: row.branch_head_name,
    supervisor_name: row.supervisor_name,
    invigilators: row.invigilators ?? "",
    absence_names: row.absence_names ?? "",
    notes: row.notes,
  };
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
     WHERE e.owner_user_id = $1 AND e.id = $2 AND e.workflow_status IN ('SUBMITTED','APPROVED')
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
  await pool.query(
    `INSERT INTO college_exam_situation_reports
       (owner_user_id, exam_schedule_id, head_submitted_at, dean_status, updated_at)
     VALUES ($1, $2, NOW(), 'PENDING', NOW())
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
  const pool = getDbPool();
  const u = await pool.query(
    `UPDATE college_exam_situation_reports
     SET dean_status = 'APPROVED', dean_reviewed_at = NOW(),
         dean_note = COALESCE(NULLIF(TRIM($3), ''), dean_note),
         updated_at = NOW()
     WHERE owner_user_id = $1 AND exam_schedule_id = $2
       AND head_submitted_at IS NOT NULL`,
    [input.ownerUserId, input.scheduleId.trim(), input.deanNote ?? ""]
  );
  if ((u.rowCount ?? 0) === 0) {
    return { ok: false, message: "لا يوجد موقف مرفوع لاعتماده أو المعرف غير صالح." };
  }
  return { ok: true };
}