import { formatCollegeStudyStageLabel, isPostgraduateStudyStageLevel } from "@/lib/college-study-stage-display";
import { sanitizeComprehensiveSectionIds } from "@/lib/comprehensive-report-sections";
import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";
import { STUDY_TYPE_LABEL_AR } from "@/lib/study-type-labels-ar";
import { normalizeStudyType } from "@/lib/college-study-subjects";
import * as XLSX from "xlsx";

/** صف جدولة امتحاني موسّع (صباحي/مسائي + تشكيل + قسم) */
export type AdminExtendedScheduleRow = {
  schedule_id: string;
  owner_user_id: string;
  formation_label: string;
  owner_username: string;
  college_subject_id: string;
  branch_name: string;
  exam_date: string;
  stage_level: number;
  workflow_status: string;
  is_uploaded: boolean;
  capacity_total: number;
  capacity_morning: number;
  capacity_evening: number;
  attendance_count: number;
  absence_count: number;
  attendance_morning: number;
  absence_morning: number;
  attendance_evening: number;
  absence_evening: number;
};

export type AdminComprehensiveBranchRow = {
  dept_id: string;
  owner_user_id: string;
  formation_label: string;
  owner_username: string;
  branch_name: string;
  branch_type: string;
};

export type AdminComprehensiveSubjectRow = {
  id: string;
  owner_user_id: string;
  formation_label: string;
  owner_username: string;
  dept_id: string;
  branch_name: string;
  subject_name: string;
  study_type: string;
  stage_level: number;
};

export type AdminComprehensiveRoomRow = {
  room_id: string;
  owner_user_id: string;
  formation_label: string;
  owner_username: string;
  dept_id: string;
  branch_name: string;
  stage_level: number;
  room_name: string;
  capacity_morning: number;
  capacity_evening: number;
  capacity_total: number;
};

const FORMATION_LABEL_SQL = `COALESCE(
  NULLIF(TRIM(
    CASE
      WHEN UPPER(COALESCE(p.account_kind::text, 'FORMATION')) = 'FOLLOWUP'
        THEN COALESCE(p.holder_name, '')
      ELSE COALESCE(p.formation_name, '')
    END
  ), ''),
  u.username::text
)`;

export async function listExtendedExamSchedulesForAdminReport(): Promise<AdminExtendedScheduleRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    schedule_id: string | number;
    owner_user_id: string | number;
    formation_label: string;
    owner_username: string;
    college_subject_id: string;
    branch_name: string;
    exam_date: string;
    stage_level: number;
    workflow_status: string;
    is_uploaded: boolean;
    capacity_total: number | string;
    capacity_morning: number | string;
    capacity_evening: number | string;
    attendance_count: number | string;
    absence_count: number | string;
    attendance_morning: number | string;
    absence_morning: number | string;
    attendance_evening: number | string;
    absence_evening: number | string;
  }>(
    `SELECT e.id AS schedule_id,
            e.owner_user_id,
            ${FORMATION_LABEL_SQL} AS formation_label,
            u.username::text AS owner_username,
            e.college_subject_id::text AS college_subject_id,
            c.branch_name,
            e.exam_date::text AS exam_date,
            e.stage_level,
            COALESCE(e.workflow_status::text, 'DRAFT') AS workflow_status,
            (rep.head_submitted_at IS NOT NULL) AS is_uploaded,
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
            END AS absence_evening
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
     LEFT JOIN college_exam_situation_reports rep
       ON rep.exam_schedule_id = e.id AND rep.owner_user_id = e.owner_user_id
     ORDER BY formation_label ASC, u.username ASC, e.exam_date ASC, e.id ASC`
  );
  return r.rows.map((row) => ({
    schedule_id: String(row.schedule_id),
    owner_user_id: String(row.owner_user_id),
    formation_label: row.formation_label,
    owner_username: row.owner_username,
    college_subject_id: row.college_subject_id,
    branch_name: row.branch_name,
    exam_date: row.exam_date,
    stage_level: Number(row.stage_level ?? 1),
    workflow_status: row.workflow_status,
    is_uploaded: Boolean(row.is_uploaded),
    capacity_total: Math.max(0, Math.floor(Number(row.capacity_total ?? 0))),
    capacity_morning: Math.max(0, Math.floor(Number(row.capacity_morning ?? 0))),
    capacity_evening: Math.max(0, Math.floor(Number(row.capacity_evening ?? 0))),
    attendance_count: Math.max(0, Math.floor(Number(row.attendance_count ?? 0))),
    absence_count: Math.max(0, Math.floor(Number(row.absence_count ?? 0))),
    attendance_morning: Math.max(0, Math.floor(Number(row.attendance_morning ?? 0))),
    absence_morning: Math.max(0, Math.floor(Number(row.absence_morning ?? 0))),
    attendance_evening: Math.max(0, Math.floor(Number(row.attendance_evening ?? 0))),
    absence_evening: Math.max(0, Math.floor(Number(row.absence_evening ?? 0))),
  }));
}

async function listComprehensiveBranches(): Promise<AdminComprehensiveBranchRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    dept_id: string;
    owner_user_id: string | number;
    formation_label: string;
    owner_username: string;
    branch_name: string;
    branch_type: string;
  }>(
    `SELECT s.id::text AS dept_id,
            s.owner_user_id,
            ${FORMATION_LABEL_SQL} AS formation_label,
            u.username::text AS owner_username,
            s.branch_name,
            COALESCE(s.branch_type, 'DEPARTMENT') AS branch_type
     FROM college_subjects s
     INNER JOIN users u ON u.id = s.owner_user_id
     INNER JOIN college_account_profiles p ON p.user_id = u.id
     WHERE u.deleted_at IS NULL AND u.role = 'COLLEGE'
     ORDER BY formation_label ASC, s.branch_name ASC`
  );
  return r.rows.map((row) => ({
    dept_id: row.dept_id,
    owner_user_id: String(row.owner_user_id),
    formation_label: row.formation_label,
    owner_username: row.owner_username,
    branch_name: row.branch_name,
    branch_type: row.branch_type,
  }));
}

async function listComprehensiveSubjects(): Promise<AdminComprehensiveSubjectRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string;
    owner_user_id: string | number;
    formation_label: string;
    owner_username: string;
    dept_id: string;
    branch_name: string;
    subject_name: string;
    study_type: string;
    stage_level: number | string;
  }>(
    `SELECT s.id::text,
            s.owner_user_id,
            ${FORMATION_LABEL_SQL} AS formation_label,
            u.username::text AS owner_username,
            c.id::text AS dept_id,
            c.branch_name,
            s.subject_name,
            COALESCE(s.study_type::text, 'ANNUAL') AS study_type,
            COALESCE(s.study_stage_level, 1)::int AS stage_level
     FROM college_study_subjects s
     INNER JOIN college_subjects c ON c.id = s.college_subject_id AND c.owner_user_id = s.owner_user_id
     INNER JOIN users u ON u.id = s.owner_user_id
     INNER JOIN college_account_profiles p ON p.user_id = u.id
     WHERE u.deleted_at IS NULL AND u.role = 'COLLEGE'
     ORDER BY formation_label ASC, c.branch_name ASC, s.subject_name ASC`
  );
  return r.rows.map((row) => ({
    id: row.id,
    owner_user_id: String(row.owner_user_id),
    formation_label: row.formation_label,
    owner_username: row.owner_username,
    dept_id: row.dept_id,
    branch_name: row.branch_name,
    subject_name: row.subject_name,
    study_type: row.study_type,
    stage_level: Number(row.stage_level) || 1,
  }));
}

async function listComprehensiveRooms(): Promise<AdminComprehensiveRoomRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    room_id: string;
    owner_user_id: string | number;
    formation_label: string;
    owner_username: string;
    dept_id: string;
    branch_name: string;
    stage_level: number | string;
    room_name: string;
    cap_m: number | string;
    cap_e: number | string;
    cap_t: number | string;
  }>(
    `SELECT r.id::text AS room_id,
            r.owner_user_id,
            ${FORMATION_LABEL_SQL} AS formation_label,
            u.username::text AS owner_username,
            c.id::text AS dept_id,
            c.branch_name,
            COALESCE(s1.study_stage_level, 1)::int AS stage_level,
            r.room_name,
            (COALESCE(r.capacity_morning, 0) + COALESCE(r.capacity_morning_2, 0)) AS cap_m,
            (COALESCE(r.capacity_evening, 0) + COALESCE(r.capacity_evening_2, 0)) AS cap_e,
            (COALESCE(r.capacity_total, 0) + COALESCE(r.capacity_total_2, 0)) AS cap_t
     FROM college_exam_rooms r
     INNER JOIN college_study_subjects s1
       ON s1.id = r.study_subject_id AND s1.owner_user_id = r.owner_user_id
     INNER JOIN college_subjects c ON c.id = s1.college_subject_id AND c.owner_user_id = r.owner_user_id
     INNER JOIN users u ON u.id = r.owner_user_id
     INNER JOIN college_account_profiles p ON p.user_id = u.id
     WHERE u.deleted_at IS NULL AND u.role = 'COLLEGE'
     ORDER BY formation_label ASC, c.branch_name ASC, r.serial_no ASC`
  );
  return r.rows.map((row) => ({
    room_id: row.room_id,
    owner_user_id: String(row.owner_user_id),
    formation_label: row.formation_label,
    owner_username: row.owner_username,
    dept_id: row.dept_id,
    branch_name: row.branch_name,
    stage_level: Number(row.stage_level) || 1,
    room_name: row.room_name,
    capacity_morning: Math.max(0, Math.floor(Number(row.cap_m ?? 0))),
    capacity_evening: Math.max(0, Math.floor(Number(row.cap_e ?? 0))),
    capacity_total: Math.max(0, Math.floor(Number(row.cap_t ?? 0))),
  }));
}

export type ComprehensiveReportBundle = {
  colleges: { owner_user_id: string; formation_label: string; owner_username: string; full_name: string }[];
  branches: AdminComprehensiveBranchRow[];
  subjects: AdminComprehensiveSubjectRow[];
  rooms: AdminComprehensiveRoomRow[];
  schedules: AdminExtendedScheduleRow[];
};

export async function loadComprehensiveReportBundle(): Promise<ComprehensiveReportBundle> {
  const poolConfigured = isDatabaseConfigured();
  if (!poolConfigured) {
    return { colleges: [], branches: [], subjects: [], rooms: [], schedules: [] };
  }
  await ensureCoreSchema();
  const pool = getDbPool();
  const [colR, branches, subjects, rooms, schedules] = await Promise.all([
    pool.query<{ owner_user_id: string | number; formation_label: string; owner_username: string; full_name: string }>(
      `SELECT u.id::text AS owner_user_id,
              ${FORMATION_LABEL_SQL} AS formation_label,
              u.username::text AS owner_username,
              u.full_name
       FROM users u
       INNER JOIN college_account_profiles p ON p.user_id = u.id
       WHERE u.deleted_at IS NULL AND u.role = 'COLLEGE'
       ORDER BY formation_label ASC`
    ),
    listComprehensiveBranches(),
    listComprehensiveSubjects(),
    listComprehensiveRooms(),
    listExtendedExamSchedulesForAdminReport(),
  ]);
  return {
    colleges: colR.rows.map((x) => ({
      owner_user_id: String(x.owner_user_id),
      formation_label: x.formation_label,
      owner_username: x.owner_username,
      full_name: x.full_name,
    })),
    branches,
    subjects,
    rooms,
    schedules,
  };
}

function studyTypeAr(t: string): string {
  const n = normalizeStudyType(t);
  return STUDY_TYPE_LABEL_AR[n];
}

function safeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
  return cleaned.length > 0 ? cleaned : "Sheet";
}

type Aoa = (string | number)[][];

function addSheet(wb: XLSX.WorkBook, title: string, aoa: Aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(title));
}

function sumSchedules(rows: AdminExtendedScheduleRow[], pred: (r: AdminExtendedScheduleRow) => boolean): number {
  return rows.filter(pred).length;
}

export function buildComprehensiveXlsxBase64(sectionIds: string[], bundle: ComprehensiveReportBundle): string {
  const sections = new Set(sanitizeComprehensiveSectionIds(sectionIds));
  if (sections.size === 0) {
    const wb = XLSX.utils.book_new();
    addSheet(wb, "تنبيه", [["لم يُختر أي قسم — اختر وسماً واحداً على الأقل."]]);
    return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })).toString("base64");
  }

  const { colleges, branches, subjects, rooms, schedules } = bundle;
  const wb = XLSX.utils.book_new();

  const deptKey = (owner: string, dept: string) => `${owner}|${dept}`;

  if (sections.has("summary_totals")) {
    const stagesFromSubjects = new Set(subjects.map((s) => s.stage_level));
    const stagesFromSched = new Set(schedules.map((s) => s.stage_level));
    const allStages = new Set([...stagesFromSubjects, ...stagesFromSched]);
    const aoa: Aoa = [
      ["ملخص عام — التقرير الشامل"],
      [],
      ["عدد الكليات (حسابات تشكيل)", colleges.length],
      ["عدد الأقسام / الفروع", branches.length],
      ["عدد المواد الدراسية", subjects.length],
      ["عدد سجلات القاعات", rooms.length],
      ["عدد جلسات الجدول الامتحاني", schedules.length],
      ["عدد الجلسات بموقف مرفوع", schedules.filter((s) => s.is_uploaded).length],
      ["عدد المراحل الظاهرة في البيانات", allStages.size],
      ["إجمالي مقاعد صباحية (مجموع جلسات)", schedules.reduce((a, r) => a + r.capacity_morning, 0)],
      ["إجمالي مقاعد مسائية (مجموع جلسات)", schedules.reduce((a, r) => a + r.capacity_evening, 0)],
      ["إجمالي حضور صباحي", schedules.reduce((a, r) => a + r.attendance_morning, 0)],
      ["إجمالي غياب صباحي", schedules.reduce((a, r) => a + r.absence_morning, 0)],
      ["إجمالي حضور مسائي", schedules.reduce((a, r) => a + r.attendance_evening, 0)],
      ["إجمالي غياب مسائي", schedules.reduce((a, r) => a + r.absence_evening, 0)],
    ];
    addSheet(wb, "ملخص عام", aoa);
  }

  if (sections.has("colleges_list")) {
    const aoa: Aoa = [
      ["اسم المستخدم", "اسم التشكيل / الوحدة", "الاسم المعروض للحساب"],
      ...colleges.map((c) => [c.owner_username, c.formation_label, c.full_name]),
    ];
    addSheet(wb, "قائمة الكليات", aoa);
  }

  if (sections.has("departments_list")) {
    const aoa: Aoa = [
      ["الكلية", "اسم المستخدم", "القسم / الفرع", "نوع (قسم/فرع)", "معرّف القسم"],
      ...branches.map((b) => [b.formation_label, b.owner_username, b.branch_name, b.branch_type, b.dept_id]),
    ];
    addSheet(wb, "قائمة الأقسام", aoa);
  }

  if (sections.has("dept_count_per_college")) {
    const m = new Map<string, { label: string; username: string; n: number }>();
    for (const b of branches) {
      const k = b.owner_user_id;
      if (!m.has(k)) m.set(k, { label: b.formation_label, username: b.owner_username, n: 0 });
      m.get(k)!.n += 1;
    }
    const rows = [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
    const aoa: Aoa = [["الكلية", "اسم المستخدم", "عدد الأقسام"], ...rows.map((r) => [r.label, r.username, r.n])];
    addSheet(wb, "أقسام لكل كلية", aoa);
  }

  if (sections.has("study_subjects_list")) {
    const aoa: Aoa = [
      ["الكلية", "القسم", "المادة", "المرحلة", "نوع الدراسة", "معرّف المادة"],
      ...subjects.map((s) => [
        s.formation_label,
        s.branch_name,
        s.subject_name,
        formatCollegeStudyStageLabel(s.stage_level),
        studyTypeAr(s.study_type),
        s.id,
      ]),
    ];
    addSheet(wb, "قائمة المواد", aoa);
  }

  if (sections.has("subject_count_by_dept")) {
    const m = new Map<string, { college: string; dept: string; username: string; n: number }>();
    for (const s of subjects) {
      const k = deptKey(s.owner_user_id, s.dept_id);
      if (!m.has(k))
        m.set(k, { college: s.formation_label, dept: s.branch_name, username: s.owner_username, n: 0 });
      m.get(k)!.n += 1;
    }
    const rows = [...m.values()].sort((a, b) => a.college.localeCompare(b.college, "ar") || a.dept.localeCompare(b.dept, "ar"));
    const aoa: Aoa = [["الكلية", "القسم", "اسم المستخدم", "عدد المواد"], ...rows.map((r) => [r.college, r.dept, r.username, r.n])];
    addSheet(wb, "مواد لكل قسم", aoa);
  }

  if (sections.has("subject_count_by_college")) {
    const m = new Map<string, { label: string; username: string; n: number }>();
    for (const s of subjects) {
      const k = s.owner_user_id;
      if (!m.has(k)) m.set(k, { label: s.formation_label, username: s.owner_username, n: 0 });
      m.get(k)!.n += 1;
    }
    const rows = [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
    const aoa: Aoa = [["الكلية", "اسم المستخدم", "عدد المواد"], ...rows.map((r) => [r.label, r.username, r.n])];
    addSheet(wb, "مواد لكل كلية", aoa);
  }

  if (sections.has("stages_reference")) {
    const set = new Set<number>();
    for (const s of subjects) set.add(s.stage_level);
    for (const e of schedules) set.add(e.stage_level);
    const sorted = [...set].sort((a, b) => a - b);
    const aoa: Aoa = [["المرحلة (رقم)", "التسمية"], ...sorted.map((lv) => [lv, formatCollegeStudyStageLabel(lv)])];
    addSheet(wb, "مراحل مرجع", aoa);
  }

  if (sections.has("subject_count_by_stage")) {
    const m = new Map<number, number>();
    for (const s of subjects) m.set(s.stage_level, (m.get(s.stage_level) ?? 0) + 1);
    const rows = [...m.entries()].sort((a, b) => a[0] - b[0]);
    const aoa: Aoa = [["المرحلة", "عدد المواد"], ...rows.map(([lv, n]) => [formatCollegeStudyStageLabel(lv), n])];
    addSheet(wb, "مواد لكل مرحلة", aoa);
  }

  if (sections.has("postgrad_subject_counts")) {
    const pg = subjects.filter((s) => isPostgraduateStudyStageLevel(s.stage_level));
    const byCollege = new Map<string, { label: string; username: string; n: number }>();
    for (const s of pg) {
      const k = s.owner_user_id;
      if (!byCollege.has(k)) byCollege.set(k, { label: s.formation_label, username: s.owner_username, n: 0 });
      byCollege.get(k)!.n += 1;
    }
    const rows = [...byCollege.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
    const aoa: Aoa = [
      ["إجمالي مواد الدراسات العليا (11–13)", pg.length],
      [],
      ["الكلية", "اسم المستخدم", "عدد مواد الدراسات العليا"],
      ...rows.map((r) => [r.label, r.username, r.n]),
    ];
    addSheet(wb, "مواد دراسات عليا", aoa);
  }

  if (sections.has("rooms_count_by_college")) {
    const m = new Map<string, { label: string; username: string; n: number }>();
    for (const r of rooms) {
      const k = r.owner_user_id;
      if (!m.has(k)) m.set(k, { label: r.formation_label, username: r.owner_username, n: 0 });
      m.get(k)!.n += 1;
    }
    const rows = [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
    const aoa: Aoa = [["الكلية", "اسم المستخدم", "عدد القاعات"], ...rows.map((r) => [r.label, r.username, r.n])];
    addSheet(wb, "قاعات لكل كلية", aoa);
  }

  if (sections.has("rooms_count_by_dept")) {
    const m = new Map<string, { college: string; dept: string; username: string; n: number }>();
    for (const r of rooms) {
      const k = deptKey(r.owner_user_id, r.dept_id);
      if (!m.has(k))
        m.set(k, { college: r.formation_label, dept: r.branch_name, username: r.owner_username, n: 0 });
      m.get(k)!.n += 1;
    }
    const rows = [...m.values()].sort((a, b) => a.college.localeCompare(b.college, "ar") || a.dept.localeCompare(b.dept, "ar"));
    const aoa: Aoa = [["الكلية", "القسم", "اسم المستخدم", "عدد القاعات"], ...rows.map((x) => [x.college, x.dept, x.username, x.n])];
    addSheet(wb, "قاعات لكل قسم", aoa);
  }

  const aggCollegeSched = () => {
    const m = new Map<
      string,
      {
        label: string;
        username: string;
        sessions: number;
        days: Set<string>;
        capM: number;
        capE: number;
        attM: number;
        absM: number;
        attE: number;
        absE: number;
        uploads: number;
      }
    >();
    for (const e of schedules) {
      const k = e.owner_user_id;
      if (!m.has(k)) {
        m.set(k, {
          label: e.formation_label,
          username: e.owner_username,
          sessions: 0,
          days: new Set(),
          capM: 0,
          capE: 0,
          attM: 0,
          absM: 0,
          attE: 0,
          absE: 0,
          uploads: 0,
        });
      }
      const x = m.get(k)!;
      x.sessions += 1;
      x.days.add(e.exam_date);
      x.capM += e.capacity_morning;
      x.capE += e.capacity_evening;
      x.attM += e.attendance_morning;
      x.absM += e.absence_morning;
      x.attE += e.attendance_evening;
      x.absE += e.absence_evening;
      if (e.is_uploaded) x.uploads += 1;
    }
    return m;
  };

  const aggDeptSched = () => {
    const m = new Map<
      string,
      {
        college: string;
        dept: string;
        username: string;
        sessions: number;
        days: Set<string>;
        capM: number;
        capE: number;
        attM: number;
        absM: number;
        attE: number;
        absE: number;
      }
    >();
    for (const e of schedules) {
      const k = deptKey(e.owner_user_id, e.college_subject_id);
      if (!m.has(k)) {
        m.set(k, {
          college: e.formation_label,
          dept: e.branch_name,
          username: e.owner_username,
          sessions: 0,
          days: new Set(),
          capM: 0,
          capE: 0,
          attM: 0,
          absM: 0,
          attE: 0,
          absE: 0,
        });
      }
      const x = m.get(k)!;
      x.sessions += 1;
      x.days.add(e.exam_date);
      x.capM += e.capacity_morning;
      x.capE += e.capacity_evening;
      x.attM += e.attendance_morning;
      x.absM += e.absence_morning;
      x.attE += e.attendance_evening;
      x.absE += e.absence_evening;
    }
    return m;
  };

  const aggStageSched = (pred: (r: AdminExtendedScheduleRow) => boolean) => {
    const m = new Map<
      number,
      { sessions: number; days: Set<string>; capM: number; capE: number; attM: number; absM: number; attE: number; absE: number }
    >();
    for (const e of schedules) {
      if (!pred(e)) continue;
      const lv = e.stage_level;
      if (!m.has(lv)) {
        m.set(lv, { sessions: 0, days: new Set(), capM: 0, capE: 0, attM: 0, absM: 0, attE: 0, absE: 0 });
      }
      const x = m.get(lv)!;
      x.sessions += 1;
      x.days.add(e.exam_date);
      x.capM += e.capacity_morning;
      x.capE += e.capacity_evening;
      x.attM += e.attendance_morning;
      x.absM += e.absence_morning;
      x.attE += e.attendance_evening;
      x.absE += e.absence_evening;
    }
    return m;
  };

  if (sections.has("schedules_by_college")) {
    const m = aggCollegeSched();
    const rows = [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
    const aoa: Aoa = [["الكلية", "اسم المستخدم", "عدد الجلسات"], ...rows.map((r) => [r.label, r.username, r.sessions])];
    addSheet(wb, "جلسات لكل كلية", aoa);
  }

  if (sections.has("schedules_by_dept")) {
    const m = aggDeptSched();
    const rows = [...m.values()].sort((a, b) => a.college.localeCompare(b.college, "ar") || a.dept.localeCompare(b.dept, "ar"));
    const aoa: Aoa = [["الكلية", "القسم", "اسم المستخدم", "عدد الجلسات"], ...rows.map((r) => [r.college, r.dept, r.username, r.sessions])];
    addSheet(wb, "جلسات لكل قسم", aoa);
  }

  if (sections.has("schedules_by_stage")) {
    const m = aggStageSched(() => true);
    const rows = [...m.entries()].sort((a, b) => a[0] - b[0]);
    const aoa: Aoa = [["المرحلة", "عدد الجلسات"], ...rows.map(([lv, x]) => [formatCollegeStudyStageLabel(lv), x.sessions])];
    addSheet(wb, "جلسات لكل مرحلة", aoa);
  }

  if (sections.has("schedules_postgrad")) {
    const n = sumSchedules(schedules, (r) => isPostgraduateStudyStageLevel(r.stage_level));
    const aoa: Aoa = [["عدد جلسات الدراسات العليا (حسب مرحلة الجدول)", n]];
    addSheet(wb, "جلسات دراسات عليا", aoa);
  }

  if (sections.has("exam_days_by_college")) {
    const m = aggCollegeSched();
    const rows = [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
    const aoa: Aoa = [["الكلية", "اسم المستخدم", "أيام فريدة"], ...rows.map((r) => [r.label, r.username, r.days.size])];
    addSheet(wb, "أيام لكل كلية", aoa);
  }

  if (sections.has("exam_days_by_dept")) {
    const m = aggDeptSched();
    const rows = [...m.values()].sort((a, b) => a.college.localeCompare(b.college, "ar") || a.dept.localeCompare(b.dept, "ar"));
    const aoa: Aoa = [["الكلية", "القسم", "أيام فريدة"], ...rows.map((r) => [r.college, r.dept, r.days.size])];
    addSheet(wb, "أيام لكل قسم", aoa);
  }

  if (sections.has("exam_days_by_stage")) {
    const m = aggStageSched(() => true);
    const rows = [...m.entries()].sort((a, b) => a[0] - b[0]);
    const aoa: Aoa = [["المرحلة", "أيام فريدة"], ...rows.map(([lv, x]) => [formatCollegeStudyStageLabel(lv), x.days.size])];
    addSheet(wb, "أيام لكل مرحلة", aoa);
  }

  if (sections.has("exam_days_postgrad")) {
    const m = aggStageSched((r) => isPostgraduateStudyStageLevel(r.stage_level));
    const totalDays = new Set<string>();
    for (const e of schedules) {
      if (isPostgraduateStudyStageLevel(e.stage_level)) totalDays.add(e.exam_date);
    }
    const aoa: Aoa = [
      ["عدد الأيام التقويمية الفريدة التي وردت فيها جلسة لدراسات عليا", totalDays.size],
      [],
      ["المرحلة", "أيام فريدة ضمن المرحلة"],
      ...[...m.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([lv, x]) => [formatCollegeStudyStageLabel(lv), x.days.size]),
    ];
    addSheet(wb, "أيام دراسات عليا", aoa);
  }

  if (sections.has("seats_morning_by_college")) {
    const m = aggCollegeSched();
    const rows = [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
    const aoa: Aoa = [["الكلية", "مقاعد صباحية (جلسات)", "اسم المستخدم"], ...rows.map((r) => [r.label, r.capM, r.username])];
    addSheet(wb, "مقاعد صب كلية", aoa);
  }

  if (sections.has("seats_morning_by_dept")) {
    const m = aggDeptSched();
    const rows = [...m.values()].sort((a, b) => a.college.localeCompare(b.college, "ar") || a.dept.localeCompare(b.dept, "ar"));
    const aoa: Aoa = [["الكلية", "القسم", "مقاعد صباحية"], ...rows.map((r) => [r.college, r.dept, r.capM])];
    addSheet(wb, "مقاعد صب لكل قسم", aoa);
  }

  if (sections.has("seats_morning_by_stage")) {
    const m = aggStageSched(() => true);
    const rows = [...m.entries()].sort((a, b) => a[0] - b[0]);
    const aoa: Aoa = [["المرحلة", "مقاعد صباحية"], ...rows.map(([lv, x]) => [formatCollegeStudyStageLabel(lv), x.capM])];
    addSheet(wb, "مقاعد صب لكل مرحلة", aoa);
  }

  if (sections.has("seats_morning_postgrad")) {
    const m = aggStageSched((r) => isPostgraduateStudyStageLevel(r.stage_level));
    const totalM = schedules
      .filter((r) => isPostgraduateStudyStageLevel(r.stage_level))
      .reduce((a, r) => a + r.capacity_morning, 0);
    const aoa: Aoa = [
      ["إجمالي مقاعد صباحية لجلسات الدراسات العليا", totalM],
      [],
      ["المرحلة", "مقاعد صباحية"],
      ...[...m.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([lv, x]) => [formatCollegeStudyStageLabel(lv), x.capM]),
    ];
    addSheet(wb, "مقاعد صب عليا", aoa);
  }

  if (sections.has("seats_evening_by_college")) {
    const m = aggCollegeSched();
    const rows = [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
    const aoa: Aoa = [["الكلية", "مقاعد مسائية", "اسم المستخدم"], ...rows.map((r) => [r.label, r.capE, r.username])];
    addSheet(wb, "مقاعد مس كلية", aoa);
  }

  if (sections.has("seats_evening_by_dept")) {
    const m = aggDeptSched();
    const rows = [...m.values()].sort((a, b) => a.college.localeCompare(b.college, "ar") || a.dept.localeCompare(b.dept, "ar"));
    const aoa: Aoa = [["الكلية", "القسم", "مقاعد مسائية"], ...rows.map((r) => [r.college, r.dept, r.capE])];
    addSheet(wb, "مقاعد مس لكل قسم", aoa);
  }

  if (sections.has("seats_evening_by_stage")) {
    const m = aggStageSched(() => true);
    const rows = [...m.entries()].sort((a, b) => a[0] - b[0]);
    const aoa: Aoa = [["المرحلة", "مقاعد مسائية"], ...rows.map(([lv, x]) => [formatCollegeStudyStageLabel(lv), x.capE])];
    addSheet(wb, "مقاعد مس لكل مرحلة", aoa);
  }

  if (sections.has("seats_evening_postgrad")) {
    const m = aggStageSched((r) => isPostgraduateStudyStageLevel(r.stage_level));
    const totalE = schedules
      .filter((r) => isPostgraduateStudyStageLevel(r.stage_level))
      .reduce((a, r) => a + r.capacity_evening, 0);
    const aoa: Aoa = [
      ["إجمالي مقاعد مسائية لجلسات الدراسات العليا", totalE],
      [],
      ["المرحلة", "مقاعد مسائية"],
      ...[...m.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([lv, x]) => [formatCollegeStudyStageLabel(lv), x.capE]),
    ];
    addSheet(wb, "مقاعد مس عليا", aoa);
  }

  if (sections.has("attendance_morning_total")) {
    const t = schedules.reduce((a, r) => a + r.attendance_morning, 0);
    addSheet(wb, "حضور صب إجمالي", [["إجمالي حضور صباحي (كل الجلسات)", t]]);
  }
  if (sections.has("absence_morning_total")) {
    const t = schedules.reduce((a, r) => a + r.absence_morning, 0);
    addSheet(wb, "غياب صب إجمالي", [["إجمالي غياب صباحي", t]]);
  }
  if (sections.has("attendance_evening_total")) {
    const t = schedules.reduce((a, r) => a + r.attendance_evening, 0);
    addSheet(wb, "حضور مس إجمالي", [["إجمالي حضور مسائي", t]]);
  }
  if (sections.has("absence_evening_total")) {
    const t = schedules.reduce((a, r) => a + r.absence_evening, 0);
    addSheet(wb, "غياب مس إجمالي", [["إجمالي غياب مسائي", t]]);
  }

  if (sections.has("attendance_morning_by_college")) {
    const m = aggCollegeSched();
    const rows = [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
    const aoa: Aoa = [["الكلية", "حضور صباحي", "اسم المستخدم"], ...rows.map((r) => [r.label, r.attM, r.username])];
    addSheet(wb, "حضور صب كلية", aoa);
  }
  if (sections.has("absence_morning_by_college")) {
    const m = aggCollegeSched();
    const rows = [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
    const aoa: Aoa = [["الكلية", "غياب صباحي", "اسم المستخدم"], ...rows.map((r) => [r.label, r.absM, r.username])];
    addSheet(wb, "غياب صب كلية", aoa);
  }
  if (sections.has("attendance_morning_by_dept")) {
    const m = aggDeptSched();
    const rows = [...m.values()].sort((a, b) => a.college.localeCompare(b.college, "ar") || a.dept.localeCompare(b.dept, "ar"));
    const aoa: Aoa = [["الكلية", "القسم", "حضور صباحي"], ...rows.map((r) => [r.college, r.dept, r.attM])];
    addSheet(wb, "حضور صب أقسام", aoa);
  }
  if (sections.has("absence_morning_by_dept")) {
    const m = aggDeptSched();
    const rows = [...m.values()].sort((a, b) => a.college.localeCompare(b.college, "ar") || a.dept.localeCompare(b.dept, "ar"));
    const aoa: Aoa = [["الكلية", "القسم", "غياب صباحي"], ...rows.map((r) => [r.college, r.dept, r.absM])];
    addSheet(wb, "غياب صب أقسام", aoa);
  }
  if (sections.has("attendance_evening_by_college")) {
    const m = aggCollegeSched();
    const rows = [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
    const aoa: Aoa = [["الكلية", "حضور مسائي", "اسم المستخدم"], ...rows.map((r) => [r.label, r.attE, r.username])];
    addSheet(wb, "حضور مس كلية", aoa);
  }
  if (sections.has("absence_evening_by_college")) {
    const m = aggCollegeSched();
    const rows = [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
    const aoa: Aoa = [["الكلية", "غياب مسائي", "اسم المستخدم"], ...rows.map((r) => [r.label, r.absE, r.username])];
    addSheet(wb, "غياب مس كلية", aoa);
  }
  if (sections.has("attendance_evening_by_dept")) {
    const m = aggDeptSched();
    const rows = [...m.values()].sort((a, b) => a.college.localeCompare(b.college, "ar") || a.dept.localeCompare(b.dept, "ar"));
    const aoa: Aoa = [["الكلية", "القسم", "حضور مسائي"], ...rows.map((r) => [r.college, r.dept, r.attE])];
    addSheet(wb, "حضور مس أقسام", aoa);
  }
  if (sections.has("absence_evening_by_dept")) {
    const m = aggDeptSched();
    const rows = [...m.values()].sort((a, b) => a.college.localeCompare(b.college, "ar") || a.dept.localeCompare(b.dept, "ar"));
    const aoa: Aoa = [["الكلية", "القسم", "غياب مسائي"], ...rows.map((r) => [r.college, r.dept, r.absE])];
    addSheet(wb, "غياب مس أقسام", aoa);
  }

  if (sections.has("uploads_by_college")) {
    const m = aggCollegeSched();
    const rows = [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
    const aoa: Aoa = [["الكلية", "اسم المستخدم", "جلسات بموقف مرفوع"], ...rows.map((r) => [r.label, r.username, r.uploads])];
    addSheet(wb, "مواقف لكل كلية", aoa);
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf).toString("base64");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML للطباعة / PDF — تحويل نفس أوراق Excel المُصدَّرة إلى جداول HTML */
export function buildComprehensivePrintHtml(sectionIds: string[], bundle: ComprehensiveReportBundle, generatedLabel: string): string {
  const sections = new Set(sanitizeComprehensiveSectionIds(sectionIds));
  const z = escapeHtml;
  if (sections.size === 0) {
    return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/><title>تقرير</title></head><body><p>لم يُختر أي قسم.</p></body></html>`;
  }

  const b64 = buildComprehensiveXlsxBase64([...sections], bundle);
  const wb = XLSX.read(Buffer.from(b64, "base64"), { type: "buffer" });
  const parts: string[] = [];
  parts.push(`<h1>التقرير الشامل</h1><p class="sub">وقت الإصدار: ${z(generatedLabel)}</p>`);
  parts.push(`<p class="note">الطباعة بحفظ PDF: من نافذة الطباعة اختر «حفظ كـ PDF». للتحليل الأدق استخدم ملف Excel.</p>`);

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 }) as (string | number)[][];
    parts.push(`<h2>${z(name)}</h2>${aoaToHtmlTable(aoa)}`);
  }

  const style = `
    body{font-family:Tajawal,Tahoma,sans-serif;padding:16px;font-size:10px;}
    h1{color:#1e3a8a;font-size:17px;}
    h2{font-size:12px;margin-top:14px;page-break-after:avoid;}
    .sub{color:#64748b;}
    .note{background:#fffbeb;border:1px solid #fcd34d;padding:8px;border-radius:8px;margin:12px 0;}
    table{border-collapse:collapse;width:100%;margin:6px 0;page-break-inside:auto;}
    tr{page-break-inside:avoid;}
    th,td{border:1px solid #94a3b8;padding:3px;text-align:right;}
    th{background:#e2e8f0;font-size:9px;}
    @page{size:A4 landscape;margin:8mm;}
  `;

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700&display=swap" rel="stylesheet"/>
  <style>${style}</style><title>تقرير شامل</title></head><body>${parts.join("")}</body></html>`;
}

function aoaToHtmlTable(aoa: (string | number)[][]): string {
  if (!aoa.length) return "<p>—</p>";
  const esc = escapeHtml;
  if (aoa.length === 1) {
    return `<table><tbody><tr>${aoa[0]!.map((c) => `<td>${esc(String(c))}</td>`).join("")}</tr></tbody></table>`;
  }
  const head = aoa[0]!.map((c) => `<th>${esc(String(c))}</th>`).join("");
  const body = aoa
    .slice(1)
    .map((row) => `<tr>${row.map((c) => `<td>${esc(String(c))}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function validateComprehensiveSectionIds(raw: string[]): string[] {
  return sanitizeComprehensiveSectionIds(raw);
}
