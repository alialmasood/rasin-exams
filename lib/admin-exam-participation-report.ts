import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

/** صف واحد: جلسة امتحان + بيانات القاعة (سعة، حضور، غياب، أسماء) لعرض إشرافي لكل التشكيلات */
export type AdminExamParticipationRow = {
  schedule_id: string;
  owner_user_id: string;
  study_subject_id: string;
  formation_label: string;
  owner_username: string;
  academic_year: string | null;
  term_label: string | null;
  exam_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  schedule_type: "FINAL" | "SEMESTER";
  workflow_status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  college_subject_id: string;
  college_subject_name: string;
  study_subject_name: string;
  stage_level: number;
  room_name: string;
  capacity_total: number;
  attendance_count: number;
  absence_count: number;
  absence_names: string | null;
};

export async function listAdminExamParticipationReport(): Promise<AdminExamParticipationRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    schedule_id: string;
    owner_user_id: string;
    study_subject_id: string;
    academic_year: string | null;
    term_label: string | null;
    exam_date: string;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    schedule_type: string;
    workflow_status: string;
    college_subject_id: string;
    college_subject_name: string;
    study_subject_name: string;
    stage_level: number;
    room_name: string;
    capacity_total: string;
    attendance_count: string;
    absence_count: string;
    absence_names: string | null;
    formation_label: string;
    owner_username: string;
  }>(
    `SELECT e.id::text AS schedule_id,
            e.owner_user_id::text AS owner_user_id,
            e.study_subject_id::text AS study_subject_id,
            e.academic_year,
            e.term_label,
            e.exam_date::text AS exam_date,
            substring(e.start_time::text, 1, 5) AS start_time,
            substring(e.end_time::text, 1, 5) AS end_time,
            e.duration_minutes,
            e.schedule_type,
            COALESCE(e.workflow_status, 'DRAFT') AS workflow_status,
            e.college_subject_id::text AS college_subject_id,
            c.branch_name AS college_subject_name,
            s.subject_name AS study_subject_name,
            e.stage_level,
            r.room_name,
            (CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.capacity_total
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.capacity_total_2, 0)
              ELSE r.capacity_total
            END)::int AS capacity_total,
            (CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.attendance_count
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.attendance_count_2, 0)
              ELSE r.attendance_count
            END)::int AS attendance_count,
            (CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_count
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.absence_count_2, 0)
              ELSE r.absence_count
            END)::int AS absence_count,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_names
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN r.absence_names_2
              ELSE r.absence_names
            END AS absence_names,
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
     ORDER BY formation_label ASC,
              u.username ASC,
              e.exam_date ASC,
              e.start_time ASC,
              c.branch_name ASC,
              s.subject_name ASC,
              e.created_at ASC`
  );

  return r.rows.map((x) => ({
    schedule_id: String(x.schedule_id),
    owner_user_id: String(x.owner_user_id),
    study_subject_id: String(x.study_subject_id ?? ""),
    formation_label: String(x.formation_label ?? "").trim() || String(x.owner_username ?? "—"),
    owner_username: String(x.owner_username ?? ""),
    academic_year: x.academic_year != null && String(x.academic_year).trim() ? String(x.academic_year).trim() : null,
    term_label: x.term_label != null && String(x.term_label).trim() ? String(x.term_label).trim() : null,
    exam_date: String(x.exam_date ?? ""),
    start_time: String(x.start_time ?? "").slice(0, 5),
    end_time: String(x.end_time ?? "").slice(0, 5),
    duration_minutes: Number(x.duration_minutes ?? 0),
    schedule_type: x.schedule_type === "SEMESTER" ? "SEMESTER" : "FINAL",
    workflow_status:
      x.workflow_status === "APPROVED"
        ? "APPROVED"
        : x.workflow_status === "REJECTED"
          ? "REJECTED"
          : x.workflow_status === "SUBMITTED"
            ? "SUBMITTED"
            : "DRAFT",
    college_subject_id: String(x.college_subject_id),
    college_subject_name: x.college_subject_name,
    study_subject_name: x.study_subject_name,
    stage_level: Number(x.stage_level ?? 1),
    room_name: x.room_name,
    capacity_total: Number(x.capacity_total ?? 0) || 0,
    attendance_count: Number(x.attendance_count ?? 0) || 0,
    absence_count: Number(x.absence_count ?? 0) || 0,
    absence_names: x.absence_names ? String(x.absence_names).trim() || null : null,
  }));
}
