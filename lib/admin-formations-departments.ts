import { normalizeStudyType, type StudyType } from "@/lib/college-study-subjects";
import {
  POSTGRAD_STUDY_STAGE_DIPLOMA,
  POSTGRAD_STUDY_STAGE_DOCTOR,
  POSTGRAD_STUDY_STAGE_MASTER,
} from "@/lib/college-study-stage-display";
import { normalizeExamMealSlot } from "@/lib/exam-meal-slot";
import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

function normalizeStudyTypeDb(v: string): StudyType {
  return normalizeStudyType(v ?? "");
}

export type FormationBranchRow = {
  id: string;
  branch_name: string;
  branch_head_name: string;
};

export type FormationStudyRecentRow = {
  id: string;
  subject_name: string;
  instructor_name: string;
  study_stage_level: number;
  linked_branch_name: string;
  study_type: StudyType;
};

/** صف جلسة في الجدول الامتحاني لعرض المدير داخل بطاقة التشكيل */
export type FormationExamScheduleDetailRow = {
  id: string;
  college_subject_name: string;
  study_subject_name: string;
  room_name: string;
  stage_level: number;
  /** نوع الدراسة للمادة (سنوي/فصلي/…)، من `college_study_subjects` */
  study_type: StudyType;
  schedule_type: "FINAL" | "SEMESTER";
  workflow_status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  term_label: string | null;
  academic_year: string | null;
  exam_date: string;
  /** 1 = الوجبة الأولى، 2 = الوجبة الثانية */
  meal_slot: 1 | 2;
  start_time: string;
  end_time: string;
  duration_minutes: number;
};

/** لقطة مراقبة لتشكيل واحد */
export type FormationControlSnapshot = {
  owner_user_id: string;
  owner_username: string;
  formation_name: string | null;
  user_status: string;
  is_active: boolean;

  departments: FormationBranchRow[];
  branches: FormationBranchRow[];

  study_subjects_total: number;
  study_subjects_by_type: Record<StudyType, number>;
  study_subjects_recent: FormationStudyRecentRow[];

  exam_rooms_count: number;
  capacity_morning_sum: number;
  capacity_evening_sum: number;
  capacity_total_sum: number;
  supervisors_unique: string[];
  /** أسماء مراقبين فريدة (مستخرجة من حقول القاعة، بعد تقسيم الفواصل) */
  invigilators_unique: string[];
  rooms_with_invigilators: number;

  schedules_total: number;
  schedules_draft: number;
  schedules_submitted: number;
  schedules_approved: number;
  schedules_rejected: number;

  situation_head_submitted: number;
  situation_pending_after_schedule: number;

  /** مواد مسجّلة بمراحل الدراسات العليا (11–13) كما في صفحة المواد الدراسية */
  postgrad_subjects_total: number;
  postgrad_subjects_diploma: number;
  postgrad_subjects_master: number;
  postgrad_subjects_doctor: number;
  /** جلسات جدول امتحاني بمرحلة عليا (11–13) */
  postgrad_exam_sessions_total: number;

  /** كل جلسات الجدول الامتحاني مرتبة بالتاريخ (نفس منطق صفحة متابعة الامتحانات للإدمن) */
  exam_schedules_detail: FormationExamScheduleDetailRow[];
};

export type AdminFormationControlRoomData = {
  activeFormationCount: number;
  inactiveFormationCount: number;
  formations: FormationControlSnapshot[];
};

function normKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function pushUnique(list: string[], seen: Set<string>, raw: string | null | undefined) {
  const t = String(raw ?? "").trim();
  if (!t) return;
  const k = normKey(t);
  if (seen.has(k)) return;
  seen.add(k);
  list.push(t);
}

function invigilatorNamesFromRaw(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(/[,،;|\n\r]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function emptyByType(): Record<StudyType, number> {
  return { ANNUAL: 0, SEMESTER: 0, COURSES: 0, BOLOGNA: 0, INTEGRATIVE: 0 };
}

/** يطابق `owner_user_id` مع نوع `public.users.id` (uuid / bigint / …). */
async function ownerUserIdAnyClause(
  pool: ReturnType<typeof getDbPool>,
  ownerIdsText: string[]
): Promise<{ sql: string; params: unknown[] }> {
  const r = await pool.query<{ udt_name: string }>(
    `SELECT udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'`
  );
  const udt = r.rows[0]?.udt_name ?? "int8";
  switch (udt) {
    case "uuid":
      return { sql: "ANY($1::uuid[])", params: [ownerIdsText] };
    case "int8":
      return { sql: "ANY($1::bigint[])", params: [ownerIdsText.map((x) => Number(x))] };
    case "int4":
      return { sql: "ANY($1::integer[])", params: [ownerIdsText.map((x) => Number(x))] };
    case "varchar":
    case "text":
      return { sql: "ANY($1::text[])", params: [ownerIdsText] };
    default:
      return { sql: "ANY($1::text[])", params: [ownerIdsText] };
  }
}

function emptySnapshot(meta: {
  owner_user_id: string;
  owner_username: string;
  formation_name: string | null;
  user_status: string;
  is_active: boolean;
}): FormationControlSnapshot {
  return {
    ...meta,
    departments: [],
    branches: [],
    study_subjects_total: 0,
    study_subjects_by_type: emptyByType(),
    study_subjects_recent: [],
    exam_rooms_count: 0,
    capacity_morning_sum: 0,
    capacity_evening_sum: 0,
    capacity_total_sum: 0,
    supervisors_unique: [],
    invigilators_unique: [],
    rooms_with_invigilators: 0,
    schedules_total: 0,
    schedules_draft: 0,
    schedules_submitted: 0,
    schedules_approved: 0,
    schedules_rejected: 0,
    situation_head_submitted: 0,
    situation_pending_after_schedule: 0,
    postgrad_subjects_total: 0,
    postgrad_subjects_diploma: 0,
    postgrad_subjects_master: 0,
    postgrad_subjects_doctor: 0,
    postgrad_exam_sessions_total: 0,
    exam_schedules_detail: [],
  };
}

function normalizeScheduleDetailRow(x: {
  id: string | number;
  college_subject_name: string;
  study_subject_name: string;
  room_name: string;
  stage_level: number;
  study_type: string;
  schedule_type: string;
  workflow_status: string;
  term_label: string | null;
  academic_year: string | null;
  exam_date: string;
  meal_slot: number | string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
}): FormationExamScheduleDetailRow {
  const wf = String(x.workflow_status ?? "DRAFT").toUpperCase();
  const workflow_status: FormationExamScheduleDetailRow["workflow_status"] =
    wf === "APPROVED"
      ? "APPROVED"
      : wf === "REJECTED"
        ? "REJECTED"
        : wf === "SUBMITTED"
          ? "SUBMITTED"
          : "DRAFT";
  return {
    id: String(x.id),
    college_subject_name: x.college_subject_name,
    study_subject_name: x.study_subject_name,
    room_name: x.room_name,
    stage_level: Number(x.stage_level ?? 1),
    study_type: normalizeStudyTypeDb(x.study_type),
    schedule_type: String(x.schedule_type).toUpperCase() === "SEMESTER" ? "SEMESTER" : "FINAL",
    workflow_status,
    term_label: x.term_label,
    academic_year: x.academic_year,
    exam_date: x.exam_date,
    meal_slot: normalizeExamMealSlot(String(x.meal_slot ?? 1)),
    start_time: String(x.start_time).slice(0, 5),
    end_time: String(x.end_time).slice(0, 5),
    duration_minutes: Number(x.duration_minutes ?? 0),
  };
}

/**
 * لوحة مراقبة مركزية: تشكيلات نشطة/غير نشطة، ثم تفصيل لكل تشكيل (أقسام، مواد، قاعات، جداول، مواقف).
 */
export async function getAdminFormationControlRoomData(): Promise<AdminFormationControlRoomData> {
  if (!isDatabaseConfigured()) {
    return { activeFormationCount: 0, inactiveFormationCount: 0, formations: [] };
  }
  await ensureCoreSchema();
  const pool = getDbPool();

  const metaR = await pool.query<{
    owner_user_id: string;
    owner_username: string;
    formation_name: string | null;
    user_status: string;
  }>(
    `SELECT u.id::text AS owner_user_id,
            u.username AS owner_username,
            p.formation_name,
            u.status AS user_status
     FROM college_account_profiles p
     INNER JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
     WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'
     ORDER BY p.formation_name ASC NULLS LAST, u.username ASC`
  );

  const formationsMeta = metaR.rows.map((r) => ({
    owner_user_id: r.owner_user_id,
    owner_username: r.owner_username,
    formation_name: r.formation_name,
    user_status: r.user_status,
    is_active: String(r.user_status).toUpperCase() === "ACTIVE",
  }));

  const activeFormationCount = formationsMeta.filter((m) => m.is_active).length;
  const inactiveFormationCount = formationsMeta.length - activeFormationCount;

  if (formationsMeta.length === 0) {
    return { activeFormationCount: 0, inactiveFormationCount: 0, formations: [] };
  }

  const ownerIds = formationsMeta.map((m) => m.owner_user_id);
  const { sql: ownerAnySql, params: ownerAnyParams } = await ownerUserIdAnyClause(pool, ownerIds);

  const [
    subjectsR,
    studyCountR,
    studyRecentR,
    roomsAggR,
    roomsPeopleR,
    schedWfR,
    sitDoneR,
    sitPendingR,
    schedulesDetailR,
    postgradSubjectsR,
    postgradSchedR,
  ] = await Promise.all([
    pool.query<{
      id: string;
      owner_user_id: string;
      branch_type: string;
      branch_name: string;
      branch_head_name: string;
    }>(
      `SELECT id::text, owner_user_id::text, COALESCE(branch_type, 'DEPARTMENT') AS branch_type,
              branch_name, branch_head_name
       FROM college_subjects
       WHERE owner_user_id = ${ownerAnySql}
       ORDER BY branch_name ASC`,
      ownerAnyParams
    ),
    pool.query<{ owner_user_id: string; study_type: string; c: string }>(
      `SELECT owner_user_id::text,
              COALESCE(NULLIF(TRIM(UPPER(study_type::text)), ''), 'ANNUAL') AS study_type,
              COUNT(*)::text AS c
       FROM college_study_subjects
       WHERE owner_user_id = ${ownerAnySql}
       GROUP BY owner_user_id, COALESCE(NULLIF(TRIM(UPPER(study_type::text)), ''), 'ANNUAL')`,
      ownerAnyParams
    ),
    pool.query<{
      id: string;
      owner_user_id: string;
      subject_name: string;
      instructor_name: string | null;
      study_stage_level: number;
      linked_branch_name: string;
      study_type: string;
    }>(
      `SELECT * FROM (
         SELECT s.id::text,
                s.owner_user_id::text,
                s.subject_name,
                TRIM(COALESCE(s.instructor_name::text, '')) AS instructor_name,
                COALESCE(s.study_stage_level, 1)::int AS study_stage_level,
                c.branch_name AS linked_branch_name,
                COALESCE(s.study_type, 'ANNUAL')::text AS study_type,
                ROW_NUMBER() OVER (PARTITION BY s.owner_user_id ORDER BY s.updated_at DESC, s.id DESC) AS rn
         FROM college_study_subjects s
         INNER JOIN college_subjects c ON c.id = s.college_subject_id AND c.owner_user_id = s.owner_user_id
         WHERE s.owner_user_id = ${ownerAnySql}
       ) t WHERE t.rn <= 14`,
      ownerAnyParams
    ),
    pool.query<{
      owner_user_id: string;
      rooms: string;
      cap_m: string;
      cap_e: string;
      cap_t: string;
    }>(
      `SELECT owner_user_id::text,
              COUNT(*)::text AS rooms,
              COALESCE(SUM(
                r.capacity_morning + CASE WHEN r.study_subject_id_2 IS NOT NULL THEN COALESCE(r.capacity_morning_2, 0) ELSE 0 END
              ), 0)::text AS cap_m,
              COALESCE(SUM(
                r.capacity_evening + CASE WHEN r.study_subject_id_2 IS NOT NULL THEN COALESCE(r.capacity_evening_2, 0) ELSE 0 END
              ), 0)::text AS cap_e,
              COALESCE(SUM(
                r.capacity_total + CASE WHEN r.study_subject_id_2 IS NOT NULL THEN COALESCE(r.capacity_total_2, 0) ELSE 0 END
              ), 0)::text AS cap_t
       FROM college_exam_rooms r
       WHERE r.owner_user_id = ${ownerAnySql}
       GROUP BY r.owner_user_id`,
      ownerAnyParams
    ),
    pool.query<{
      owner_user_id: string;
      supervisor_name: string | null;
      supervisor_name_2: string | null;
      invigilators: string | null;
      invigilators_2: string | null;
    }>(
      `SELECT owner_user_id::text, supervisor_name, supervisor_name_2, invigilators, invigilators_2
       FROM college_exam_rooms
       WHERE owner_user_id = ${ownerAnySql}`,
      ownerAnyParams
    ),
    pool.query<{ owner_user_id: string; wf: string; c: string }>(
      `SELECT owner_user_id::text,
              UPPER(TRIM(COALESCE(workflow_status::text, 'DRAFT'))) AS wf,
              COUNT(*)::text AS c
       FROM college_exam_schedules
       WHERE owner_user_id = ${ownerAnySql}
       GROUP BY owner_user_id, UPPER(TRIM(COALESCE(workflow_status::text, 'DRAFT')))`,
      ownerAnyParams
    ),
    pool.query<{ owner_user_id: string; c: string }>(
      `SELECT owner_user_id::text, COUNT(*)::text AS c
       FROM college_exam_situation_reports
       WHERE owner_user_id = ${ownerAnySql}
         AND head_submitted_at IS NOT NULL
       GROUP BY owner_user_id`,
      ownerAnyParams
    ),
    pool.query<{ owner_user_id: string; c: string }>(
      `SELECT e.owner_user_id::text, COUNT(*)::text AS c
       FROM college_exam_schedules e
       LEFT JOIN college_exam_situation_reports r
         ON r.exam_schedule_id = e.id AND r.owner_user_id = e.owner_user_id
       WHERE e.owner_user_id = ${ownerAnySql}
         AND UPPER(TRIM(COALESCE(e.workflow_status::text, 'DRAFT'))) IN ('SUBMITTED', 'APPROVED')
         AND (r.id IS NULL OR r.head_submitted_at IS NULL)
       GROUP BY e.owner_user_id`,
      ownerAnyParams
    ),
    pool.query<{
      id: string | number;
      owner_user_id: string;
      college_subject_name: string;
      study_subject_name: string;
      room_name: string;
      stage_level: number;
      study_type: string;
      schedule_type: string;
      workflow_status: string;
      term_label: string | null;
      academic_year: string | null;
      exam_date: string;
      meal_slot: number | string | null;
      start_time: string;
      end_time: string;
      duration_minutes: number;
    }>(
      `SELECT e.id,
              e.owner_user_id::text,
              c.branch_name AS college_subject_name,
              s.subject_name AS study_subject_name,
              rm.room_name,
              e.stage_level,
              COALESCE(s.study_type::text, 'ANNUAL') AS study_type,
              e.schedule_type,
              COALESCE(e.workflow_status, 'DRAFT') AS workflow_status,
              e.term_label,
              e.academic_year,
              e.exam_date::text,
              COALESCE(e.meal_slot, 1) AS meal_slot,
              e.start_time::text,
              e.end_time::text,
              e.duration_minutes
       FROM college_exam_schedules e
       INNER JOIN college_subjects c
         ON c.id = e.college_subject_id AND c.owner_user_id = e.owner_user_id
       INNER JOIN college_study_subjects s
         ON s.id = e.study_subject_id AND s.owner_user_id = e.owner_user_id
       INNER JOIN college_exam_rooms rm
         ON rm.id = e.room_id AND rm.owner_user_id = e.owner_user_id
       WHERE e.owner_user_id = ${ownerAnySql}
       ORDER BY e.owner_user_id, e.exam_date ASC, e.meal_slot ASC, e.start_time ASC, e.created_at ASC, e.id ASC`,
      ownerAnyParams
    ),
    pool.query<{ owner_user_id: string; lvl: number; c: string }>(
      `SELECT owner_user_id::text,
              COALESCE(study_stage_level, 1)::int AS lvl,
              COUNT(*)::text AS c
       FROM college_study_subjects
       WHERE owner_user_id = ${ownerAnySql}
         AND COALESCE(study_stage_level, 1) BETWEEN $${ownerAnyParams.length + 1} AND $${ownerAnyParams.length + 2}
       GROUP BY owner_user_id, COALESCE(study_stage_level, 1)`,
      [...ownerAnyParams, POSTGRAD_STUDY_STAGE_DIPLOMA, POSTGRAD_STUDY_STAGE_DOCTOR]
    ),
    pool.query<{ owner_user_id: string; c: string }>(
      `SELECT owner_user_id::text, COUNT(*)::text AS c
       FROM college_exam_schedules
       WHERE owner_user_id = ${ownerAnySql}
         AND COALESCE(stage_level, 1) BETWEEN $${ownerAnyParams.length + 1} AND $${ownerAnyParams.length + 2}
       GROUP BY owner_user_id`,
      [...ownerAnyParams, POSTGRAD_STUDY_STAGE_DIPLOMA, POSTGRAD_STUDY_STAGE_DOCTOR]
    ),
  ]);

  const byOwnerSubjects = new Map<string, FormationBranchRow[]>();
  const byOwnerBranches = new Map<string, FormationBranchRow[]>();
  for (const row of subjectsR.rows) {
    const item = { id: row.id, branch_name: row.branch_name, branch_head_name: row.branch_head_name };
    if (row.branch_type === "BRANCH") {
      const arr = byOwnerBranches.get(row.owner_user_id) ?? [];
      arr.push(item);
      byOwnerBranches.set(row.owner_user_id, arr);
    } else {
      const arr = byOwnerSubjects.get(row.owner_user_id) ?? [];
      arr.push(item);
      byOwnerSubjects.set(row.owner_user_id, arr);
    }
  }

  const studyTypeByOwner = new Map<string, Record<StudyType, number>>();
  const studyTotalByOwner = new Map<string, number>();
  for (const row of studyCountR.rows) {
    const t = normalizeStudyTypeDb(row.study_type);
    const c = Number(row.c) || 0;
    if (!studyTypeByOwner.has(row.owner_user_id)) {
      studyTypeByOwner.set(row.owner_user_id, emptyByType());
      studyTotalByOwner.set(row.owner_user_id, 0);
    }
    const rec = studyTypeByOwner.get(row.owner_user_id)!;
    rec[t] = (rec[t] ?? 0) + c;
    studyTotalByOwner.set(row.owner_user_id, (studyTotalByOwner.get(row.owner_user_id) ?? 0) + c);
  }

  const recentByOwner = new Map<string, FormationStudyRecentRow[]>();
  for (const row of studyRecentR.rows) {
    const arr = recentByOwner.get(row.owner_user_id) ?? [];
    arr.push({
      id: row.id,
      subject_name: row.subject_name,
      instructor_name: String(row.instructor_name ?? "").trim(),
      study_stage_level: row.study_stage_level,
      linked_branch_name: row.linked_branch_name,
      study_type: normalizeStudyTypeDb(row.study_type),
    });
    recentByOwner.set(row.owner_user_id, arr);
  }

  const roomsAggMap = new Map<
    string,
    { rooms: number; cap_m: number; cap_e: number; cap_t: number }
  >();
  for (const row of roomsAggR.rows) {
    roomsAggMap.set(row.owner_user_id, {
      rooms: Number(row.rooms) || 0,
      cap_m: Number(row.cap_m) || 0,
      cap_e: Number(row.cap_e) || 0,
      cap_t: Number(row.cap_t) || 0,
    });
  }

  const roomStaffByOwner = new Map<
    string,
    { supervisorNames: string[]; invigilatorNames: string[]; invRooms: number }
  >();
  for (const row of roomsPeopleR.rows) {
    const oid = row.owner_user_id;
    if (!roomStaffByOwner.has(oid)) {
      roomStaffByOwner.set(oid, { supervisorNames: [], invigilatorNames: [], invRooms: 0 });
    }
    const pack = roomStaffByOwner.get(oid)!;
    const supSeen = new Set(pack.supervisorNames.map(normKey));
    pushUnique(pack.supervisorNames, supSeen, row.supervisor_name);
    pushUnique(pack.supervisorNames, supSeen, row.supervisor_name_2);
    const invSeen = new Set(pack.invigilatorNames.map(normKey));
    for (const n of invigilatorNamesFromRaw(row.invigilators)) {
      pushUnique(pack.invigilatorNames, invSeen, n);
    }
    for (const n of invigilatorNamesFromRaw(row.invigilators_2)) {
      pushUnique(pack.invigilatorNames, invSeen, n);
    }
    const inv1 = String(row.invigilators ?? "").trim();
    const inv2 = String(row.invigilators_2 ?? "").trim();
    if (inv1.length > 0 || inv2.length > 0) pack.invRooms += 1;
  }

  const schedMap = new Map<
    string,
    { draft: number; submitted: number; approved: number; rejected: number; total: number }
  >();
  for (const row of schedWfR.rows) {
    const oid = row.owner_user_id;
    const c = Number(row.c) || 0;
    if (!schedMap.has(oid)) {
      schedMap.set(oid, { draft: 0, submitted: 0, approved: 0, rejected: 0, total: 0 });
    }
    const m = schedMap.get(oid)!;
    m.total += c;
    const wf = row.wf;
    if (wf === "DRAFT") m.draft += c;
    else if (wf === "SUBMITTED") m.submitted += c;
    else if (wf === "APPROVED") m.approved += c;
    else if (wf === "REJECTED") m.rejected += c;
    else m.draft += c;
  }

  const sitDoneMap = new Map<string, number>();
  for (const row of sitDoneR.rows) {
    sitDoneMap.set(row.owner_user_id, Number(row.c) || 0);
  }
  const sitPendingMap = new Map<string, number>();
  for (const row of sitPendingR.rows) {
    sitPendingMap.set(row.owner_user_id, Number(row.c) || 0);
  }

  const schedulesDetailByOwner = new Map<string, FormationExamScheduleDetailRow[]>();
  for (const row of schedulesDetailR.rows) {
    const oid = row.owner_user_id;
    const arr = schedulesDetailByOwner.get(oid) ?? [];
    arr.push(normalizeScheduleDetailRow(row));
    schedulesDetailByOwner.set(oid, arr);
  }

  const postgradSubjectsByOwner = new Map<
    string,
    { diploma: number; master: number; doctor: number; total: number }
  >();
  for (const row of postgradSubjectsR.rows) {
    const oid = row.owner_user_id;
    const c = Number(row.c) || 0;
    const lvl = Number(row.lvl);
    if (!postgradSubjectsByOwner.has(oid)) {
      postgradSubjectsByOwner.set(oid, { diploma: 0, master: 0, doctor: 0, total: 0 });
    }
    const p = postgradSubjectsByOwner.get(oid)!;
    p.total += c;
    if (lvl === POSTGRAD_STUDY_STAGE_DIPLOMA) p.diploma += c;
    else if (lvl === POSTGRAD_STUDY_STAGE_MASTER) p.master += c;
    else if (lvl === POSTGRAD_STUDY_STAGE_DOCTOR) p.doctor += c;
  }

  const postgradSchedByOwner = new Map<string, number>();
  for (const row of postgradSchedR.rows) {
    postgradSchedByOwner.set(row.owner_user_id, Number(row.c) || 0);
  }

  const formations: FormationControlSnapshot[] = formationsMeta.map((meta) => {
    const id = meta.owner_user_id;
    const snap = emptySnapshot(meta);
    snap.departments = byOwnerSubjects.get(id) ?? [];
    snap.branches = byOwnerBranches.get(id) ?? [];
    snap.study_subjects_by_type = studyTypeByOwner.get(id) ?? emptyByType();
    snap.study_subjects_total = studyTotalByOwner.get(id) ?? 0;
    snap.study_subjects_recent = recentByOwner.get(id) ?? [];
    const ra = roomsAggMap.get(id);
    if (ra) {
      snap.exam_rooms_count = ra.rooms;
      snap.capacity_morning_sum = ra.cap_m;
      snap.capacity_evening_sum = ra.cap_e;
      snap.capacity_total_sum = ra.cap_t;
    }
    const people = roomStaffByOwner.get(id);
    if (people) {
      snap.supervisors_unique = people.supervisorNames;
      snap.invigilators_unique = people.invigilatorNames;
      snap.rooms_with_invigilators = people.invRooms;
    }
    const sm = schedMap.get(id);
    if (sm) {
      snap.schedules_total = sm.total;
      snap.schedules_draft = sm.draft;
      snap.schedules_submitted = sm.submitted;
      snap.schedules_approved = sm.approved;
      snap.schedules_rejected = sm.rejected;
    }
    snap.situation_head_submitted = sitDoneMap.get(id) ?? 0;
    snap.situation_pending_after_schedule = sitPendingMap.get(id) ?? 0;
    snap.exam_schedules_detail = schedulesDetailByOwner.get(id) ?? [];
    const pgSub = postgradSubjectsByOwner.get(id);
    snap.postgrad_subjects_total = pgSub?.total ?? 0;
    snap.postgrad_subjects_diploma = pgSub?.diploma ?? 0;
    snap.postgrad_subjects_master = pgSub?.master ?? 0;
    snap.postgrad_subjects_doctor = pgSub?.doctor ?? 0;
    snap.postgrad_exam_sessions_total = postgradSchedByOwner.get(id) ?? 0;
    return snap;
  });

  return { activeFormationCount, inactiveFormationCount, formations };
}
