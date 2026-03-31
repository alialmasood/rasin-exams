import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { EXAM_SITUATION_TZ } from "@/lib/exam-situation-window";
import { ensureCoreSchema } from "@/lib/schema";

/** إحصائيات إجمالية لكل التشكيلات/حسابات الكلية — للوحة التحكم العامة */
export type UniversityWideDashboardStats = {
  formationAccounts: number;
  followupAccounts: number;
  /** أقسام + فروع (جدول college_subjects) */
  collegeSubjectsTotal: number;
  /** سجلات نوع «قسم» (DEPARTMENT) */
  collegeSubjectsDepartments: number;
  /** سجلات نوع «فرع» (BRANCH) */
  collegeSubjectsBranches: number;
  examRoomsTotal: number;
  /** مجموع سعات القاعات (امتحان ١ + ٢ إن وُجد) */
  examSeatsCapacityTotal: number;
  /**
   * مجموع أعداد الغياب المسجّلة في قاعات الامتحان (`absence_count` + `absence_count_2`)
   * لكل حسابات الكلية — يعكس المدخلات في «إدارة القاعات» وليس بالضرورة طلبة مميّزين.
   */
  totalStudentAbsenceAcrossFormations: number;
  studySubjectsTotal: number;
  /** عدد صفوف ربط الجدول الامتحاني بالقاعات (كل حسابات الكلية النشطة) */
  examSchedulesTotal: number;
  /** صفوف الجدول الامتحاني لحسابات التشكيل فقط (لا تشمل متابعة) */
  examSchedulesTotalAcrossFormations: number;
  examSchedulesFinal: number;
  examSchedulesSemester: number;
  /**
   * جلسات الجدول الامتحاني التي تم تأكيد رفع الموقف الامتحاني لها (`head_submitted_at` غير فارغ)
   * عبر حسابات الكلية النشطة.
   */
  examsCompletedSituationSubmittedTotal: number;
  /** جلسات جدول امتحاني بتاريخ اليوم (توقيت بغداد) — كل حسابات الكلية النشطة */
  examSessionsTodayTotal: number;
  /**
   * جلسات بتاريخ الغد التقويمي (بغداد)، مع استبعاد الجلسات التي تقع في يوم مسجّل كعطلة
   * لذات التشكيل (`college_holidays`).
   */
  examSessionsTomorrowExcludingHolidaysTotal: number;
};

const EMPTY: UniversityWideDashboardStats = {
  formationAccounts: 0,
  followupAccounts: 0,
  collegeSubjectsTotal: 0,
  collegeSubjectsDepartments: 0,
  collegeSubjectsBranches: 0,
  examRoomsTotal: 0,
  examSeatsCapacityTotal: 0,
  totalStudentAbsenceAcrossFormations: 0,
  studySubjectsTotal: 0,
  examSchedulesTotal: 0,
  examSchedulesTotalAcrossFormations: 0,
  examSchedulesFinal: 0,
  examSchedulesSemester: 0,
  examsCompletedSituationSubmittedTotal: 0,
  examSessionsTodayTotal: 0,
  examSessionsTomorrowExcludingHolidaysTotal: 0,
};

export async function getUniversityWideDashboardStats(): Promise<UniversityWideDashboardStats> {
  if (!isDatabaseConfigured()) return { ...EMPTY };
  await ensureCoreSchema();
  const pool = getDbPool();

  try {
    const [
      formationR,
      followupR,
      subjectsR,
      roomsR,
      capacityR,
      absenceR,
      studyR,
      schedulesR,
      schedulesFormationR,
      finalR,
      semesterR,
      situationSubmittedR,
      examsTodayR,
      examsTomorrowR,
    ] = await Promise.all([
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM college_account_profiles p
         INNER JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
         WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'`
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM college_account_profiles p
         INNER JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
         WHERE p.account_kind = 'FOLLOWUP'`
      ),
      pool.query<{ total: string; departments: string; branches: string }>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE COALESCE(c.branch_type, 'DEPARTMENT') = 'DEPARTMENT')::text AS departments,
                COUNT(*) FILTER (WHERE c.branch_type = 'BRANCH')::text AS branches
         FROM college_subjects c
         INNER JOIN users u ON u.id = c.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'`
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM college_exam_rooms r
         INNER JOIN users u ON u.id = r.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'`
      ),
      pool.query<{ c: string }>(
        `SELECT COALESCE(SUM(
           r.capacity_total + CASE WHEN r.study_subject_id_2 IS NOT NULL THEN r.capacity_total_2 ELSE 0 END
         ), 0)::text AS c
         FROM college_exam_rooms r
         INNER JOIN users u ON u.id = r.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'`
      ),
      pool.query<{ c: string }>(
        `SELECT COALESCE(SUM(r.absence_count + r.absence_count_2), 0)::text AS c
         FROM college_exam_rooms r
         INNER JOIN users u ON u.id = r.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'`
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM college_study_subjects s
         INNER JOIN users u ON u.id = s.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'`
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM college_exam_schedules e
         INNER JOIN users u ON u.id = e.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'`
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM college_exam_schedules e
         INNER JOIN users u ON u.id = e.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
         INNER JOIN college_account_profiles p ON p.user_id = u.id
         WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'`
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM college_exam_schedules e
         INNER JOIN users u ON u.id = e.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
         WHERE e.schedule_type = 'FINAL'`
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM college_exam_schedules e
         INNER JOIN users u ON u.id = e.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
         WHERE e.schedule_type = 'SEMESTER'`
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM college_exam_situation_reports rep
         INNER JOIN users u ON u.id = rep.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
         INNER JOIN college_exam_schedules e
           ON e.id = rep.exam_schedule_id AND e.owner_user_id = rep.owner_user_id
         WHERE rep.head_submitted_at IS NOT NULL`
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM college_exam_schedules e
         INNER JOIN users u ON u.id = e.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
         WHERE e.exam_date = (timezone($1::text, now()))::date`,
        [EXAM_SITUATION_TZ]
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM college_exam_schedules e
         INNER JOIN users u ON u.id = e.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
         WHERE e.exam_date = ((timezone($1::text, now()))::date + INTERVAL '1 day')::date
           AND NOT EXISTS (
             SELECT 1 FROM college_holidays h
             WHERE h.owner_user_id = e.owner_user_id AND h.holiday_date = e.exam_date
           )`,
        [EXAM_SITUATION_TZ]
      ),
    ]);

    const num = (r: { rows: { c: string }[] }) => Number(r.rows[0]?.c ?? 0) || 0;
    const subj = subjectsR.rows[0];
    const subjectsTotal = Number(subj?.total ?? 0) || 0;
    const subjectsDepartments = Number(subj?.departments ?? 0) || 0;
    const subjectsBranches = Number(subj?.branches ?? 0) || 0;

    return {
      formationAccounts: num(formationR),
      followupAccounts: num(followupR),
      collegeSubjectsTotal: subjectsTotal,
      collegeSubjectsDepartments: subjectsDepartments,
      collegeSubjectsBranches: subjectsBranches,
      examRoomsTotal: num(roomsR),
      examSeatsCapacityTotal: num(capacityR),
      totalStudentAbsenceAcrossFormations: num(absenceR),
      studySubjectsTotal: num(studyR),
      examSchedulesTotal: num(schedulesR),
      examSchedulesTotalAcrossFormations: num(schedulesFormationR),
      examSchedulesFinal: num(finalR),
      examSchedulesSemester: num(semesterR),
      examsCompletedSituationSubmittedTotal: num(situationSubmittedR),
      examSessionsTodayTotal: num(examsTodayR),
      examSessionsTomorrowExcludingHolidaysTotal: num(examsTomorrowR),
    };
  } catch (e) {
    console.error("[getUniversityWideDashboardStats]", e);
    return { ...EMPTY };
  }
}
