import { formatCollegeStudyStageLabel } from "@/lib/college-study-stage-display";
import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

/** تجميع يومي لجلسات الجدول الامتحاني عبر كل حسابات التشكيل (نفس مصدر صفحة جداول الكلية). */
export type UniversityExamCalendarDayAgg = {
  exam_date: string;
  session_count: number;
  formation_count: number;
};

/**
 * أيام تحتوي على جلسة امتحانية واحدة على الأقل في أي تشكيل،
 * من `college_exam_schedules` لمالكين بدور COLLEGE وغير محذوفين.
 */
export async function listUniversityExamCalendarDayAggregates(): Promise<UniversityExamCalendarDayAgg[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    exam_date: string;
    session_count: string;
    formation_count: string;
  }>(
    `SELECT s.exam_date::text AS exam_date,
            COUNT(*)::int AS session_count,
            COUNT(DISTINCT s.owner_user_id)::int AS formation_count
     FROM college_exam_schedules s
     INNER JOIN users u ON u.id = s.owner_user_id
     WHERE u.role = 'COLLEGE'
       AND u.deleted_at IS NULL
     GROUP BY s.exam_date
     ORDER BY s.exam_date ASC`
  );
  return r.rows.map((row) => ({
    exam_date: row.exam_date,
    session_count: Number(row.session_count),
    formation_count: Number(row.formation_count),
  }));
}

/** سطر واحد: تشكيل + مادة + مرحلة (بدون تكرار لنفس التوليفة ضمن اليوم). */
export type UniversityExamCalendarDayDetailLine = {
  formationLabel: string;
  subjectName: string;
  stageLabel: string;
};

/**
 * تفاصيل يوم امتحان واحد عبر الجامعة — التشكيل، اسم المادة، المرحلة الدراسية فقط.
 */
export async function listUniversityExamCalendarDayDetail(
  examDate: string
): Promise<UniversityExamCalendarDayDetailLine[]> {
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return [];
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    formation_label: string;
    subject_name: string;
    stage_level: number | string;
  }>(
    `SELECT DISTINCT
       COALESCE(
         NULLIF(TRIM(p.formation_name), ''),
         NULLIF(TRIM(p.holder_name), ''),
         NULLIF(TRIM(u.username), ''),
         '—'
       ) AS formation_label,
       TRIM(s.subject_name) AS subject_name,
       e.stage_level
     FROM college_exam_schedules e
     INNER JOIN users u ON u.id = e.owner_user_id AND u.role = 'COLLEGE' AND u.deleted_at IS NULL
     LEFT JOIN college_account_profiles p ON p.user_id = e.owner_user_id
     INNER JOIN college_study_subjects s
       ON s.id = e.study_subject_id AND s.owner_user_id = e.owner_user_id
     WHERE e.exam_date = $1::date
     ORDER BY formation_label ASC, subject_name ASC, e.stage_level ASC`,
    [d]
  );
  return r.rows.map((row) => ({
    formationLabel: row.formation_label,
    subjectName: row.subject_name,
    stageLabel: formatCollegeStudyStageLabel(Number(row.stage_level ?? 1)),
  }));
}
