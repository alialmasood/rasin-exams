import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { EXAM_SITUATION_TZ } from "@/lib/exam-situation-window";
import { ensureCoreSchema } from "@/lib/schema";
import {
  UPCOMING_EXAMS_DASHBOARD_PREVIEW_LIMIT,
  type DashboardUpcomingExamSessionRow,
  type FormationAttendanceIndicatorRow,
  type UniversityWideDashboardStats,
} from "@/lib/university-wide-dashboard-types";

export type {
  DashboardUpcomingExamSessionRow,
  FormationAttendanceIndicatorRow,
  UniversityWideDashboardStats,
} from "@/lib/university-wide-dashboard-types";

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
  examSessionsCurrentWeekByDaySatFirst: [0, 0, 0, 0, 0, 0, 0],
  examSessionsCurrentWeekStartIso: null,
  formationAttendanceIndicators: [],
  aggregateExamAttendancePct: null,
  examRoomsWithScheduleFormationCount: 0,
  examRoomsWithoutScheduleFormationCount: 0,
  examSessionsTodayFormationTotal: 0,
  totalStudentAbsenceFormationAccounts: 0,
  upcomingExamSessionsPreview: [],
  upcomingExamSessionsFutureCountFormation: 0,
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
      examWeekActivityR,
      formationAttendanceR,
      examRoomsScheduleStatusFormationR,
      examsTodayFormationR,
      absenceFormationR,
      upcomingExamsPreviewR,
      upcomingExamsFutureCountFormationR,
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
      pool.query<{
        week_start_iso: string;
        c0: string;
        c1: string;
        c2: string;
        c3: string;
        c4: string;
        c5: string;
        c6: string;
      }>(
        `WITH today AS (
           SELECT (timezone($1::text, now()))::date AS d
         ),
         wk AS (
           SELECT (d - ((EXTRACT(DOW FROM d)::int + 1) % 7))::date AS ws FROM today
         )
         SELECT wk.ws::text AS week_start_iso,
                COALESCE(SUM(CASE WHEN v.exam_date - wk.ws = 0 THEN 1 END), 0)::text AS c0,
                COALESCE(SUM(CASE WHEN v.exam_date - wk.ws = 1 THEN 1 END), 0)::text AS c1,
                COALESCE(SUM(CASE WHEN v.exam_date - wk.ws = 2 THEN 1 END), 0)::text AS c2,
                COALESCE(SUM(CASE WHEN v.exam_date - wk.ws = 3 THEN 1 END), 0)::text AS c3,
                COALESCE(SUM(CASE WHEN v.exam_date - wk.ws = 4 THEN 1 END), 0)::text AS c4,
                COALESCE(SUM(CASE WHEN v.exam_date - wk.ws = 5 THEN 1 END), 0)::text AS c5,
                COALESCE(SUM(CASE WHEN v.exam_date - wk.ws = 6 THEN 1 END), 0)::text AS c6
         FROM wk
         LEFT JOIN (
           SELECT e.exam_date
           FROM college_exam_schedules e
           INNER JOIN users u ON u.id = e.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
           INNER JOIN college_account_profiles p ON p.user_id = u.id
           WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'
         ) v ON v.exam_date >= wk.ws AND v.exam_date <= wk.ws + 6
         GROUP BY wk.ws`,
        [EXAM_SITUATION_TZ]
      ),
      pool.query<{ formation_label: string; present_sum: string; absent_sum: string }>(
        `SELECT MAX(COALESCE(NULLIF(TRIM(p.formation_name), ''), u.username)) AS formation_label,
                SUM(
                  CASE
                    WHEN e.study_subject_id = r.study_subject_id THEN r.attendance_count
                    WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                      THEN COALESCE(r.attendance_count_2, 0)
                    ELSE r.attendance_count
                  END
                )::text AS present_sum,
                SUM(
                  CASE
                    WHEN e.study_subject_id = r.study_subject_id THEN r.absence_count
                    WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                      THEN COALESCE(r.absence_count_2, 0)
                    ELSE r.absence_count
                  END
                )::text AS absent_sum
         FROM college_exam_schedules e
         INNER JOIN college_exam_rooms r ON r.id = e.room_id
         INNER JOIN users u ON u.id = e.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
         INNER JOIN college_account_profiles p ON p.user_id = u.id
         WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'
         GROUP BY u.id
         HAVING
           SUM(
             CASE
               WHEN e.study_subject_id = r.study_subject_id THEN r.attendance_count
               WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                 THEN COALESCE(r.attendance_count_2, 0)
               ELSE r.attendance_count
             END
           )
           + SUM(
             CASE
               WHEN e.study_subject_id = r.study_subject_id THEN r.absence_count
               WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                 THEN COALESCE(r.absence_count_2, 0)
               ELSE r.absence_count
             END
           ) > 0`
      ),
      pool.query<{ active: string; inactive: string }>(
        `SELECT COUNT(*) FILTER (WHERE EXISTS (
                  SELECT 1 FROM college_exam_schedules e
                  WHERE e.room_id = r.id AND e.owner_user_id = r.owner_user_id
                ))::text AS active,
                COUNT(*) FILTER (WHERE NOT EXISTS (
                  SELECT 1 FROM college_exam_schedules e
                  WHERE e.room_id = r.id AND e.owner_user_id = r.owner_user_id
                ))::text AS inactive
         FROM college_exam_rooms r
         INNER JOIN users u ON u.id = r.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
         INNER JOIN college_account_profiles p ON p.user_id = u.id
         WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'`
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM college_exam_schedules e
         INNER JOIN users u ON u.id = e.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
         INNER JOIN college_account_profiles p ON p.user_id = u.id
         WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'
           AND e.exam_date = (timezone($1::text, now()))::date`,
        [EXAM_SITUATION_TZ]
      ),
      pool.query<{ c: string }>(
        `SELECT COALESCE(SUM(r.absence_count + r.absence_count_2), 0)::text AS c
         FROM college_exam_rooms r
         INNER JOIN users u ON u.id = r.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
         INNER JOIN college_account_profiles p ON p.user_id = u.id
         WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'`
      ),
      pool.query<{
        schedule_id: string;
        subject_name: string;
        exam_date: string;
        start_time: string;
        room_name: string;
        formation_label: string;
        workflow_status: string;
      }>(
        `SELECT e.id::text AS schedule_id,
                s.subject_name AS subject_name,
                e.exam_date::text AS exam_date,
                substring(e.start_time::text, 1, 5) AS start_time,
                r.room_name AS room_name,
                COALESCE(NULLIF(TRIM(p.formation_name), ''), u.username::text) AS formation_label,
                COALESCE(e.workflow_status, 'DRAFT') AS workflow_status
         FROM college_exam_schedules e
         INNER JOIN college_subjects c
           ON c.id = e.college_subject_id AND c.owner_user_id = e.owner_user_id
         INNER JOIN college_study_subjects s
           ON s.id = e.study_subject_id AND s.owner_user_id = e.owner_user_id
         INNER JOIN college_exam_rooms r
           ON r.id = e.room_id AND r.owner_user_id = e.owner_user_id
         INNER JOIN users u ON u.id = e.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
         INNER JOIN college_account_profiles p ON p.user_id = u.id
         WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'
           AND e.exam_date >= (timezone($1::text, now()))::date
         ORDER BY e.exam_date ASC, e.start_time ASC, e.created_at ASC
         LIMIT ${UPCOMING_EXAMS_DASHBOARD_PREVIEW_LIMIT}`,
        [EXAM_SITUATION_TZ]
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM college_exam_schedules e
         INNER JOIN users u ON u.id = e.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
         INNER JOIN college_account_profiles p ON p.user_id = u.id
         WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'
           AND e.exam_date >= (timezone($1::text, now()))::date`,
        [EXAM_SITUATION_TZ]
      ),
    ]);

    const num = (r: { rows: { c: string }[] }) => Number(r.rows[0]?.c ?? 0) || 0;
    const subj = subjectsR.rows[0];
    const subjectsTotal = Number(subj?.total ?? 0) || 0;
    const subjectsDepartments = Number(subj?.departments ?? 0) || 0;
    const subjectsBranches = Number(subj?.branches ?? 0) || 0;

    const weekRow = examWeekActivityR.rows[0];
    const weekStartIso = weekRow?.week_start_iso?.trim() || null;
    const parseC = (s: string | undefined) => Number(s ?? 0) || 0;
    const examSessionsCurrentWeekByDaySatFirst: number[] = weekRow
      ? [
          parseC(weekRow.c0),
          parseC(weekRow.c1),
          parseC(weekRow.c2),
          parseC(weekRow.c3),
          parseC(weekRow.c4),
          parseC(weekRow.c5),
          parseC(weekRow.c6),
        ]
      : [0, 0, 0, 0, 0, 0, 0];

    const attendanceParsed = formationAttendanceR.rows.map((row) => {
      const present = Number(row.present_sum ?? 0) || 0;
      const absent = Number(row.absent_sum ?? 0) || 0;
      const total = present + absent;
      const label = String(row.formation_label ?? "").trim() || "—";
      const attendancePct = total > 0 ? Math.round((present / total) * 100) : 0;
      return { label, present, absent, attendancePct, total };
    });
    const attendanceSorted = [...attendanceParsed].sort((a, b) => b.total - a.total);
    const formationAttendanceIndicators: FormationAttendanceIndicatorRow[] = attendanceSorted
      .slice(0, 4)
      .map(({ label, present, absent, attendancePct }) => ({ label, present, absent, attendancePct }));
    const grandPresent = attendanceParsed.reduce((s, r) => s + r.present, 0);
    const grandAbsent = attendanceParsed.reduce((s, r) => s + r.absent, 0);
    const grandTotal = grandPresent + grandAbsent;
    const aggregateExamAttendancePct =
      grandTotal > 0 ? Math.round((grandPresent / grandTotal) * 100) : null;

    const roomSchedRow = examRoomsScheduleStatusFormationR.rows[0];
    const examRoomsWithScheduleFormationCount = Number(roomSchedRow?.active ?? 0) || 0;
    const examRoomsWithoutScheduleFormationCount = Number(roomSchedRow?.inactive ?? 0) || 0;

    const normalizeDashboardWorkflow = (raw: string): DashboardUpcomingExamSessionRow["workflowStatus"] => {
      const v = String(raw ?? "DRAFT").trim().toUpperCase();
      if (v === "APPROVED") return "APPROVED";
      if (v === "REJECTED") return "REJECTED";
      if (v === "SUBMITTED") return "SUBMITTED";
      return "DRAFT";
    };
    const upcomingExamSessionsPreview: DashboardUpcomingExamSessionRow[] = upcomingExamsPreviewR.rows.map(
      (row) => ({
        scheduleId: String(row.schedule_id ?? ""),
        subjectName: String(row.subject_name ?? "").trim() || "—",
        examDateIso: String(row.exam_date ?? "").trim(),
        startTime: String(row.start_time ?? "").slice(0, 5) || "—",
        roomName: String(row.room_name ?? "").trim() || "—",
        formationLabel: String(row.formation_label ?? "").trim() || "—",
        workflowStatus: normalizeDashboardWorkflow(row.workflow_status),
      })
    );

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
      examSessionsCurrentWeekByDaySatFirst,
      examSessionsCurrentWeekStartIso: weekStartIso,
      formationAttendanceIndicators,
      aggregateExamAttendancePct,
      examRoomsWithScheduleFormationCount,
      examRoomsWithoutScheduleFormationCount,
      examSessionsTodayFormationTotal: num(examsTodayFormationR),
      totalStudentAbsenceFormationAccounts: num(absenceFormationR),
      upcomingExamSessionsPreview,
      upcomingExamSessionsFutureCountFormation: num(upcomingExamsFutureCountFormationR),
    };
  } catch (e) {
    console.error("[getUniversityWideDashboardStats]", e);
    return { ...EMPTY };
  }
}
