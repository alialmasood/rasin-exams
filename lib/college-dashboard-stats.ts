import { DASHBOARD_TIMELINE_MAX_BRANCHES } from "@/lib/college-dashboard-constants";
import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";
import { normalizeStudyType, type StudyType } from "@/lib/college-study-subjects";
import { STUDY_TYPE_LABEL_AR } from "@/lib/study-type-labels-ar";
import { listOfficialExamSituationsForOwner } from "@/lib/college-exam-situations";

export { STUDY_TYPE_LABEL_AR };

function normalizeStudyTypeDb(v: string): StudyType {
  return normalizeStudyType(v ?? "");
}

function invigilatorNamesFromRaw(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(/[,،;|\n\r]+/u)
    .map((s) => s.trim())
      .filter((s) => s.length > 0);
}

function normPersonKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const TIMELINE_LINE_COLORS = ["#1e40af", "#2563eb", "#0891b2", "#059669", "#d97706", "#7c3aed", "#db2777"];

function buildBranchTimelineChart(
  raw: { d: string; branch_id: string; branch_name: string; cnt: number }[]
): { chartData: BranchTimelineChartRow[]; lines: BranchTimelineLineMeta[] } {
  if (raw.length === 0) return { chartData: [], lines: [] };

  const totals = new Map<string, { id: string; name: string; total: number }>();
  for (const r of raw) {
    const prev = totals.get(r.branch_id) ?? { id: r.branch_id, name: r.branch_name, total: 0 };
    prev.total += r.cnt;
    totals.set(r.branch_id, prev);
  }
  const top = [...totals.values()].sort((a, b) => b.total - a.total).slice(0, DASHBOARD_TIMELINE_MAX_BRANCHES);
  const topIds = new Set(top.map((t) => t.id));

  const dates = [...new Set(raw.map((r) => r.d))].sort();
  const lines: BranchTimelineLineMeta[] = top.map((t, i) => ({
    dataKey: `b${t.id}`,
    label: t.name,
    color: TIMELINE_LINE_COLORS[i % TIMELINE_LINE_COLORS.length]!,
  }));

  const chartData: BranchTimelineChartRow[] = dates.map((d) => {
    const row: BranchTimelineChartRow = { date: d };
    for (const line of lines) {
      row[line.dataKey] = 0;
    }
    for (const r of raw) {
      if (r.d !== d || !topIds.has(r.branch_id)) continue;
      const key = `b${r.branch_id}`;
      row[key] = (Number(row[key]) || 0) + r.cnt;
    }
    return row;
  });

  return { chartData, lines };
}

export type BranchSubjectRow = { branchName: string; studySubjectCount: number };

export type BranchExamProgressRow = {
  branchName: string;
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
};

/** صف جاهز لـ Recharts: مفتاح كل قسم بحرف b + id لتفادي التصادم */
export type BranchTimelineChartRow = Record<string, string | number>;

export type BranchTimelineLineMeta = { dataKey: string; label: string; color: string };

/** حضور وغياب مجمّع من جلسات الجدول (بيانات القاعات كما في الموقف الامتحاني) */
export type StudentAttendanceSummary = {
  present: number;
  absent: number;
  total: number;
};

export type DashboardActivityRow = {
  occurredAt: string;
  title: string;
  description: string;
};

const SCHEDULE_WORKFLOW_LABEL: Record<string, string> = {
  DRAFT: "مسودة",
  SUBMITTED: "مرفوع للمتابعة",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
};

function toIsoTimestamp(d: Date | string): string {
  if (d instanceof Date) return d.toISOString();
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toISOString();
}

function buildRecentActivities(
  reports: Array<{
    updated_at: Date;
    head_submitted_at: Date | null;
    dean_reviewed_at: Date | null;
    dean_status: string | null;
    subject_name: string;
    exam_date: string;
  }>,
  schedules: Array<{
    updated_at: Date;
    workflow_status: string | null;
    subject_name: string;
    exam_date: string;
  }>
): DashboardActivityRow[] {
  type Item = DashboardActivityRow & { _t: number };
  const items: Item[] = [];

  for (const r of reports) {
    const st = String(r.dean_status ?? "NONE").toUpperCase();
    let title = "تحديث سجل الموقف الامتحاني";
    if (r.dean_reviewed_at) {
      if (st === "APPROVED") title = "اعتماد الموقف من العميد";
      else if (st === "REJECTED") title = "رفض الموقف من العميد";
      else title = "مراجعة الموقف من العميد";
    } else if (r.head_submitted_at) {
      title = "تأكيد رفع الموقف (رئيس القسم)";
    }
    const t = new Date(r.updated_at).getTime();
    items.push({
      occurredAt: toIsoTimestamp(r.updated_at),
      title,
      description: `${r.subject_name} — تاريخ الامتحان ${r.exam_date}`,
      _t: t,
    });
  }

  for (const s of schedules) {
    const wf = String(s.workflow_status ?? "DRAFT").toUpperCase();
    const label = SCHEDULE_WORKFLOW_LABEL[wf] ?? wf;
    items.push({
      occurredAt: toIsoTimestamp(s.updated_at),
      title: `تحديث حالة الجدول: ${label}`,
      description: `${s.subject_name} — تاريخ الامتحان ${s.exam_date}`,
      _t: new Date(s.updated_at).getTime(),
    });
  }

  items.sort((a, b) => b._t - a._t);
  const out: DashboardActivityRow[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const key = `${it.title}|${it.description}|${Math.floor(it._t / 60000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ occurredAt: it.occurredAt, title: it.title, description: it.description });
    if (out.length >= 15) break;
  }
  return out;
}

export type CollegeDashboardSnapshot = {
  branches: { total: number; departments: number; branchFaculties: number };
  studySubjects: {
    total: number;
    byType: { type: StudyType; key: string; label: string; count: number }[];
  };
  rooms: { total: number };
  people: { uniqueSupervisors: number; uniqueInvigilators: number };
  schedules: {
    total: number;
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
  };
  examDays: { distinctDates: number; byDate: { date: string; sessions: number }[] };
  situations: {
    totalRows: number;
    uploaded: number;
    notUploaded: number;
    complete: number;
    incomplete: number;
  };
  /** مواد دراسية لكل قسم/فرع */
  byBranchSubjects: BranchSubjectRow[];
  /** جلسات امتحانية لكل قسم حسب حالة سير العمل */
  byBranchExamProgress: BranchExamProgressRow[];
  /** خط زمني: جلسات لكل يوم امتحان لأكثر الأقسام نشاطاً */
  branchTimeline: {
    chartData: BranchTimelineChartRow[];
    lines: BranchTimelineLineMeta[];
  };
  studentAttendanceSummary: StudentAttendanceSummary;
  recentActivities: DashboardActivityRow[];
};

function emptySnapshot(): CollegeDashboardSnapshot {
  const types: StudyType[] = ["ANNUAL", "SEMESTER", "COURSES", "BOLOGNA", "INTEGRATIVE"];
  return {
    branches: { total: 0, departments: 0, branchFaculties: 0 },
    studySubjects: {
      total: 0,
      byType: types.map((type) => ({
        type,
        key: type,
        label: STUDY_TYPE_LABEL_AR[type],
        count: 0,
      })),
    },
    rooms: { total: 0 },
    people: { uniqueSupervisors: 0, uniqueInvigilators: 0 },
    schedules: { total: 0, draft: 0, submitted: 0, approved: 0, rejected: 0 },
    examDays: { distinctDates: 0, byDate: [] },
    situations: { totalRows: 0, uploaded: 0, notUploaded: 0, complete: 0, incomplete: 0 },
    byBranchSubjects: [],
    byBranchExamProgress: [],
    branchTimeline: { chartData: [], lines: [] },
    studentAttendanceSummary: { present: 0, absent: 0, total: 0 },
    recentActivities: [],
  };
}

export async function getCollegeDashboardSnapshot(
  ownerUserId: string,
  restrictCollegeSubjectId?: string | null
): Promise<CollegeDashboardSnapshot> {
  if (!isDatabaseConfigured()) return emptySnapshot();
  await ensureCoreSchema();
  const pool = getDbPool();
  const rid = restrictCollegeSubjectId?.trim() ?? null;
  const p2 = rid ? [ownerUserId, rid] : [ownerUserId];

  const [br, st, rmRow, rmPeople, sch, days, situations, subjByBranch, examByBranch, timelineRaw, repActivity, schActivity] =
    await Promise.all([
    pool.query<{ total: number; departments: number; branch_faculties: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE COALESCE(branch_type, 'DEPARTMENT') = 'DEPARTMENT')::int AS departments,
              COUNT(*) FILTER (WHERE branch_type = 'BRANCH')::int AS branch_faculties
       FROM college_subjects WHERE owner_user_id = $1${rid ? " AND id = $2::bigint" : ""}`,
      p2
    ),
    pool.query<{ study_type: string; c: number }>(
      `SELECT COALESCE(study_type, 'ANNUAL') AS study_type, COUNT(*)::int AS c
       FROM college_study_subjects WHERE owner_user_id = $1${rid ? " AND college_subject_id = $2::bigint" : ""}
       GROUP BY COALESCE(study_type, 'ANNUAL')`,
      p2
    ),
    rid
      ? pool.query<{ c: number }>(
          `SELECT COUNT(*)::int AS c
           FROM college_exam_rooms r
           INNER JOIN college_study_subjects s ON s.id = r.study_subject_id AND s.owner_user_id = r.owner_user_id
           LEFT JOIN college_study_subjects s2 ON s2.id = r.study_subject_id_2 AND s2.owner_user_id = r.owner_user_id
           WHERE r.owner_user_id = $1
             AND (s.college_subject_id = $2::bigint OR (s2.id IS NOT NULL AND s2.college_subject_id = $2::bigint))`,
          p2
        )
      : pool.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM college_exam_rooms WHERE owner_user_id = $1`, [
          ownerUserId,
        ]),
    rid
      ? pool.query<{
          supervisor_name: string;
          supervisor_name_2: string | null;
          invigilators: string | null;
          invigilators_2: string | null;
        }>(
          `SELECT r.supervisor_name, r.supervisor_name_2, r.invigilators, r.invigilators_2
           FROM college_exam_rooms r
           INNER JOIN college_study_subjects s ON s.id = r.study_subject_id AND s.owner_user_id = r.owner_user_id
           LEFT JOIN college_study_subjects s2 ON s2.id = r.study_subject_id_2 AND s2.owner_user_id = r.owner_user_id
           WHERE r.owner_user_id = $1
             AND (s.college_subject_id = $2::bigint OR (s2.id IS NOT NULL AND s2.college_subject_id = $2::bigint))`,
          p2
        )
      : pool.query<{
          supervisor_name: string;
          supervisor_name_2: string | null;
          invigilators: string | null;
          invigilators_2: string | null;
        }>(
          `SELECT supervisor_name, supervisor_name_2, invigilators, invigilators_2
           FROM college_exam_rooms WHERE owner_user_id = $1`,
          [ownerUserId]
        ),
    pool.query<{
      total: number;
      draft: number;
      submitted: number;
      approved: number;
      rejected: number;
    }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE COALESCE(workflow_status, 'DRAFT') = 'DRAFT')::int AS draft,
              COUNT(*) FILTER (WHERE workflow_status = 'SUBMITTED')::int AS submitted,
              COUNT(*) FILTER (WHERE workflow_status = 'APPROVED')::int AS approved,
              COUNT(*) FILTER (WHERE workflow_status = 'REJECTED')::int AS rejected
       FROM college_exam_schedules WHERE owner_user_id = $1${rid ? " AND college_subject_id = $2::bigint" : ""}`,
      p2
    ),
    pool.query<{ d: string; c: number }>(
      `SELECT exam_date::text AS d, COUNT(*)::int AS c
       FROM college_exam_schedules WHERE owner_user_id = $1${rid ? " AND college_subject_id = $2::bigint" : ""}
       GROUP BY exam_date ORDER BY exam_date ASC`,
      p2
    ),
    listOfficialExamSituationsForOwner(ownerUserId, rid),
    pool.query<{ branch_name: string; cnt: number }>(
      `SELECT c.branch_name, COUNT(ss.id)::int AS cnt
       FROM college_subjects c
       LEFT JOIN college_study_subjects ss ON ss.college_subject_id = c.id AND ss.owner_user_id = c.owner_user_id
       WHERE c.owner_user_id = $1${rid ? " AND c.id = $2::bigint" : ""}
       GROUP BY c.id, c.branch_name
       ORDER BY c.branch_name ASC`,
      p2
    ),
    pool.query<{
      branch_name: string;
      total: number;
      draft: number;
      submitted: number;
      approved: number;
      rejected: number;
    }>(
      `SELECT c.branch_name,
              COUNT(e.id)::int AS total,
              COUNT(e.id) FILTER (WHERE COALESCE(e.workflow_status, 'DRAFT') = 'DRAFT')::int AS draft,
              COUNT(e.id) FILTER (WHERE e.workflow_status = 'SUBMITTED')::int AS submitted,
              COUNT(e.id) FILTER (WHERE e.workflow_status = 'APPROVED')::int AS approved,
              COUNT(e.id) FILTER (WHERE e.workflow_status = 'REJECTED')::int AS rejected
       FROM college_subjects c
       LEFT JOIN college_exam_schedules e
              ON e.college_subject_id = c.id AND e.owner_user_id = c.owner_user_id
       WHERE c.owner_user_id = $1${rid ? " AND c.id = $2::bigint" : ""}
       GROUP BY c.id, c.branch_name
       ORDER BY c.branch_name ASC`,
      p2
    ),
    pool.query<{ d: string; branch_id: string; branch_name: string; cnt: number }>(
      `SELECT e.exam_date::text AS d,
              c.id::text AS branch_id,
              c.branch_name,
              COUNT(*)::int AS cnt
       FROM college_exam_schedules e
       INNER JOIN college_subjects c ON c.id = e.college_subject_id AND c.owner_user_id = e.owner_user_id
       WHERE e.owner_user_id = $1${rid ? " AND e.college_subject_id = $2::bigint" : ""}
       GROUP BY e.exam_date, c.id, c.branch_name
       ORDER BY e.exam_date ASC, c.branch_name ASC`,
      p2
    ),
    pool.query<{
      updated_at: Date;
      head_submitted_at: Date | null;
      dean_reviewed_at: Date | null;
      dean_status: string | null;
      subject_name: string;
      exam_date: string;
    }>(
      `SELECT rep.updated_at, rep.head_submitted_at, rep.dean_reviewed_at, rep.dean_status,
              s.subject_name, e.exam_date::text AS exam_date
       FROM college_exam_situation_reports rep
       INNER JOIN college_exam_schedules e ON e.id = rep.exam_schedule_id AND e.owner_user_id = rep.owner_user_id
       INNER JOIN college_study_subjects s ON s.id = e.study_subject_id
       WHERE rep.owner_user_id = $1${rid ? " AND e.college_subject_id = $2::bigint" : ""}
       ORDER BY rep.updated_at DESC
       LIMIT 18`,
      p2
    ),
    pool.query<{
      updated_at: Date;
      workflow_status: string | null;
      subject_name: string;
      exam_date: string;
    }>(
      `SELECT e.updated_at, COALESCE(e.workflow_status, 'DRAFT') AS workflow_status,
              s.subject_name, e.exam_date::text AS exam_date
       FROM college_exam_schedules e
       INNER JOIN college_study_subjects s ON s.id = e.study_subject_id
       WHERE e.owner_user_id = $1${rid ? " AND e.college_subject_id = $2::bigint" : ""}
       ORDER BY e.updated_at DESC
       LIMIT 18`,
      p2
    ),
  ]);

  const supKeys = new Set<string>();
  const invKeys = new Set<string>();
  for (const row of rmPeople.rows) {
    const s1 = String(row.supervisor_name ?? "").trim();
    if (s1) supKeys.add(normPersonKey(s1));
    const s2 = String(row.supervisor_name_2 ?? "").trim();
    if (s2) supKeys.add(normPersonKey(s2));
    for (const n of invigilatorNamesFromRaw(row.invigilators)) {
      invKeys.add(normPersonKey(n));
    }
    for (const n of invigilatorNamesFromRaw(row.invigilators_2)) {
      invKeys.add(normPersonKey(n));
    }
  }

  const countMap = new Map<StudyType, number>();
  for (const r of st.rows) {
    const t = normalizeStudyTypeDb(r.study_type);
    countMap.set(t, (countMap.get(t) ?? 0) + Number(r.c));
  }
  const allTypes: StudyType[] = ["ANNUAL", "SEMESTER", "COURSES", "BOLOGNA", "INTEGRATIVE"];
  const byType = allTypes.map((type) => ({
    type,
    key: type,
    label: STUDY_TYPE_LABEL_AR[type],
    count: countMap.get(type) ?? 0,
  }));
  const studyTotal = byType.reduce((a, x) => a + x.count, 0);

  const b0 = br.rows[0];
  const srow = sch.rows[0];
  const rmc = rmRow.rows[0];

  let uploaded = 0;
  let notUploaded = 0;
  let complete = 0;
  let incomplete = 0;
  let presentSum = 0;
  let absentSum = 0;
  for (const row of situations) {
    if (row.is_uploaded) uploaded += 1;
    else notUploaded += 1;
    if (row.is_complete) complete += 1;
    else incomplete += 1;
    presentSum += row.attendance_count;
    absentSum += row.absence_count;
  }

  const byBranchSubjects: BranchSubjectRow[] = subjByBranch.rows.map((r) => ({
    branchName: r.branch_name,
    studySubjectCount: Number(r.cnt ?? 0),
  }));

  const byBranchExamProgress: BranchExamProgressRow[] = examByBranch.rows.map((r) => ({
    branchName: r.branch_name,
    total: Number(r.total ?? 0),
    draft: Number(r.draft ?? 0),
    submitted: Number(r.submitted ?? 0),
    approved: Number(r.approved ?? 0),
    rejected: Number(r.rejected ?? 0),
  }));

  const branchTimeline = buildBranchTimelineChart(timelineRaw.rows);

  const recentActivities = buildRecentActivities(repActivity.rows, schActivity.rows);

  return {
    branches: {
      total: Number(b0?.total ?? 0),
      departments: Number(b0?.departments ?? 0),
      branchFaculties: Number(b0?.branch_faculties ?? 0),
    },
    studySubjects: { total: studyTotal, byType },
    rooms: { total: Number(rmc?.c ?? 0) },
    people: { uniqueSupervisors: supKeys.size, uniqueInvigilators: invKeys.size },
    schedules: {
      total: Number(srow?.total ?? 0),
      draft: Number(srow?.draft ?? 0),
      submitted: Number(srow?.submitted ?? 0),
      approved: Number(srow?.approved ?? 0),
      rejected: Number(srow?.rejected ?? 0),
    },
    examDays: {
      distinctDates: days.rows.length,
      byDate: days.rows.map((r) => ({ date: r.d, sessions: Number(r.c) })),
    },
    situations: {
      totalRows: situations.length,
      uploaded,
      notUploaded,
      complete,
      incomplete,
    },
    byBranchSubjects,
    byBranchExamProgress,
    branchTimeline,
    studentAttendanceSummary: {
      present: presentSum,
      absent: absentSum,
      total: presentSum + absentSum,
    },
    recentActivities,
  };
}
