import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

export type FormationActivityKind =
  | "college_subject"
  | "study_subject"
  | "exam_room"
  | "exam_schedule"
  | "situation_submit";

export type FormationActivityItem = {
  id: string;
  kind: FormationActivityKind;
  /** إنشاء أو تعديل لاحق لنفس السجل */
  event_action: "create" | "update";
  occurred_at: string;
  formation_label: string;
  owner_username: string;
  /** سطر عربي جاهز للعرض */
  line_ar: string;
};

function workflowShortAr(st: string): string {
  const u = String(st ?? "DRAFT").toUpperCase();
  if (u === "APPROVED") return "معتمد";
  if (u === "REJECTED") return "مرفوض";
  if (u === "SUBMITTED") return "مرفوع للمتابعة";
  return "مسودة";
}

function q(s: string): string {
  return `«${s.trim() || "—"}»`;
}

/** فاصل زمني بسيط لتجاهل تطابق created_at و updated_at عند الإدراج */
const UPDATE_AFTER_CREATE_SQL = `INTERVAL '1 second'`;

/**
 * أنشطة التشكيلات (FORMATION): إنشاء وتعديل للأقسام/الفروع، المواد، القاعات، الجداول، وإرسال الموقف.
 * التعديلات تُستنتج عندما يكون updated_at أحدث من created_at بأكثر من ثانية.
 */
export async function listFormationActivityFeed(limit = 120): Promise<FormationActivityItem[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const lim = Math.min(300, Math.max(1, Math.floor(limit)));

  const r = await pool.query<{
    kind: string;
    entity_id: string;
    occurred_at: Date;
    formation_label: string;
    owner_username: string;
    detail: unknown;
  }>(
    `SELECT * FROM (
       SELECT
         'college_subject'::text AS kind,
         s.id::text AS entity_id,
         s.created_at AS occurred_at,
         COALESCE(NULLIF(TRIM(p.formation_name), ''), u.username::text) AS formation_label,
         u.username::text AS owner_username,
         jsonb_build_object(
           'event_action', 'create',
           'branch_type', COALESCE(s.branch_type, 'DEPARTMENT'),
           'branch_name', s.branch_name
         ) AS detail
       FROM college_subjects s
       INNER JOIN users u ON u.id = s.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
       LEFT JOIN college_account_profiles p ON p.user_id = u.id
       WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'

       UNION ALL

       SELECT
         'college_subject',
         s.id::text,
         s.updated_at,
         COALESCE(NULLIF(TRIM(p.formation_name), ''), u.username::text),
         u.username::text,
         jsonb_build_object(
           'event_action', 'update',
           'branch_type', COALESCE(s.branch_type, 'DEPARTMENT'),
           'branch_name', s.branch_name
         )
       FROM college_subjects s
       INNER JOIN users u ON u.id = s.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
       LEFT JOIN college_account_profiles p ON p.user_id = u.id
       WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'
         AND s.updated_at > s.created_at + ${UPDATE_AFTER_CREATE_SQL}

       UNION ALL

       SELECT
         'study_subject',
         ss.id::text,
         ss.created_at,
         COALESCE(NULLIF(TRIM(p.formation_name), ''), u.username::text),
         u.username::text,
         jsonb_build_object(
           'event_action', 'create',
           'subject_name', ss.subject_name,
           'branch_name', c.branch_name,
           'branch_type', COALESCE(c.branch_type, 'DEPARTMENT')
         )
       FROM college_study_subjects ss
       INNER JOIN users u ON u.id = ss.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
       INNER JOIN college_subjects c ON c.id = ss.college_subject_id AND c.owner_user_id = ss.owner_user_id
       LEFT JOIN college_account_profiles p ON p.user_id = u.id
       WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'

       UNION ALL

       SELECT
         'study_subject',
         ss.id::text,
         ss.updated_at,
         COALESCE(NULLIF(TRIM(p.formation_name), ''), u.username::text),
         u.username::text,
         jsonb_build_object(
           'event_action', 'update',
           'subject_name', ss.subject_name,
           'branch_name', c.branch_name,
           'branch_type', COALESCE(c.branch_type, 'DEPARTMENT')
         )
       FROM college_study_subjects ss
       INNER JOIN users u ON u.id = ss.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
       INNER JOIN college_subjects c ON c.id = ss.college_subject_id AND c.owner_user_id = ss.owner_user_id
       LEFT JOIN college_account_profiles p ON p.user_id = u.id
       WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'
         AND ss.updated_at > ss.created_at + ${UPDATE_AFTER_CREATE_SQL}

       UNION ALL

       SELECT
         'exam_room',
         r.id::text,
         r.created_at,
         COALESCE(NULLIF(TRIM(p.formation_name), ''), u.username::text),
         u.username::text,
         jsonb_build_object(
           'event_action', 'create',
           'room_name', r.room_name,
           'study_subject_name', st.subject_name
         )
       FROM college_exam_rooms r
       INNER JOIN users u ON u.id = r.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
       INNER JOIN college_study_subjects st ON st.id = r.study_subject_id AND st.owner_user_id = r.owner_user_id
       LEFT JOIN college_account_profiles p ON p.user_id = u.id
       WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'

       UNION ALL

       SELECT
         'exam_room',
         r.id::text,
         r.updated_at,
         COALESCE(NULLIF(TRIM(p.formation_name), ''), u.username::text),
         u.username::text,
         jsonb_build_object(
           'event_action', 'update',
           'room_name', r.room_name,
           'study_subject_name', st.subject_name
         )
       FROM college_exam_rooms r
       INNER JOIN users u ON u.id = r.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
       INNER JOIN college_study_subjects st ON st.id = r.study_subject_id AND st.owner_user_id = r.owner_user_id
       LEFT JOIN college_account_profiles p ON p.user_id = u.id
       WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'
         AND r.updated_at > r.created_at + ${UPDATE_AFTER_CREATE_SQL}

       UNION ALL

       SELECT
         'exam_schedule',
         e.id::text,
         e.created_at,
         COALESCE(NULLIF(TRIM(p.formation_name), ''), u.username::text),
         u.username::text,
         jsonb_build_object(
           'event_action', 'create',
           'study_subject_name', st.subject_name,
           'branch_name', c.branch_name,
           'room_name', rm.room_name,
           'exam_date', e.exam_date::text,
           'meal_slot', COALESCE(e.meal_slot, 1),
           'start_time', substring(e.start_time::text, 1, 5),
           'workflow_status', COALESCE(e.workflow_status, 'DRAFT')
         )
       FROM college_exam_schedules e
       INNER JOIN users u ON u.id = e.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
       INNER JOIN college_study_subjects st ON st.id = e.study_subject_id AND st.owner_user_id = e.owner_user_id
       INNER JOIN college_subjects c ON c.id = e.college_subject_id AND c.owner_user_id = e.owner_user_id
       INNER JOIN college_exam_rooms rm ON rm.id = e.room_id AND rm.owner_user_id = e.owner_user_id
       LEFT JOIN college_account_profiles p ON p.user_id = u.id
       WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'

       UNION ALL

       SELECT
         'exam_schedule',
         e.id::text,
         e.updated_at,
         COALESCE(NULLIF(TRIM(p.formation_name), ''), u.username::text),
         u.username::text,
         jsonb_build_object(
           'event_action', 'update',
           'study_subject_name', st.subject_name,
           'branch_name', c.branch_name,
           'room_name', rm.room_name,
           'exam_date', e.exam_date::text,
           'meal_slot', COALESCE(e.meal_slot, 1),
           'start_time', substring(e.start_time::text, 1, 5),
           'workflow_status', COALESCE(e.workflow_status, 'DRAFT')
         )
       FROM college_exam_schedules e
       INNER JOIN users u ON u.id = e.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
       INNER JOIN college_study_subjects st ON st.id = e.study_subject_id AND st.owner_user_id = e.owner_user_id
       INNER JOIN college_subjects c ON c.id = e.college_subject_id AND c.owner_user_id = e.owner_user_id
       INNER JOIN college_exam_rooms rm ON rm.id = e.room_id AND rm.owner_user_id = e.owner_user_id
       LEFT JOIN college_account_profiles p ON p.user_id = u.id
       WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'
         AND e.updated_at > e.created_at + ${UPDATE_AFTER_CREATE_SQL}

       UNION ALL

       SELECT
         'situation_submit',
         sf.id::text,
         sf.submitted_at,
         COALESCE(NULLIF(TRIM(p.formation_name), ''), u.username::text),
         u.username::text,
         jsonb_build_object('event_action', 'create') AS detail
       FROM college_situation_form_submissions sf
       INNER JOIN users u ON u.id = sf.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
       LEFT JOIN college_account_profiles p ON p.user_id = u.id
       WHERE COALESCE(p.account_kind, 'FORMATION') = 'FORMATION'
     ) x
     ORDER BY x.occurred_at DESC
     LIMIT $1`,
    [lim]
  );

  const kinds: Set<string> = new Set([
    "college_subject",
    "study_subject",
    "exam_room",
    "exam_schedule",
    "situation_submit",
  ]);

  return r.rows.map((row) => {
    const kind = kinds.has(row.kind) ? (row.kind as FormationActivityKind) : "college_subject";
    const fl = String(row.formation_label ?? "").trim() || String(row.owner_username ?? "—");
    const d = (row.detail && typeof row.detail === "object" ? row.detail : {}) as Record<string, unknown>;
    const isUpdate = String(d.event_action ?? "create") === "update";
    const verbAdd = isUpdate ? "عدّل" : "أضاف";

    let line_ar = "";
    switch (kind) {
      case "college_subject": {
        const isBranch = String(d.branch_type ?? "").toUpperCase() === "BRANCH";
        const noun = isBranch ? "فرعاً" : "قسماً";
        line_ar = `${q(fl)} ${verbAdd} ${noun} ${q(String(d.branch_name ?? ""))}`;
        break;
      }
      case "study_subject": {
        const isBr = String(d.branch_type ?? "").toUpperCase() === "BRANCH";
        const deptWord = isBr ? "الفرع" : "القسم";
        line_ar = `${q(fl)} ${verbAdd} مادة دراسية ${q(String(d.subject_name ?? ""))} ضمن ${deptWord} ${q(String(d.branch_name ?? ""))}`;
        break;
      }
      case "exam_room": {
        line_ar = `${q(fl)} ${verbAdd} قاعة امتحان ${q(String(d.room_name ?? ""))} للمادة ${q(String(d.study_subject_name ?? ""))}`;
        break;
      }
      case "exam_schedule": {
        const wf = workflowShortAr(String(d.workflow_status ?? "DRAFT"));
        const date = String(d.exam_date ?? "");
        const t = String(d.start_time ?? "");
        const ms = Number(d.meal_slot ?? 1) === 2 ? "الوجبة الثانية" : "الوجبة الأولى";
        line_ar = `${q(fl)} ${verbAdd} جلسة في الجدول الامتحاني — ${q(String(d.study_subject_name ?? ""))} — ${date} (${ms}) ${t} — قاعة ${q(String(d.room_name ?? ""))} — ${wf}`;
        break;
      }
      case "situation_submit":
        line_ar = `${q(fl)} أرسل تحديث الموقف الامتحاني (نموذج الموقف)`;
        break;
      default:
        line_ar = `${q(fl)} نشاط مسجّل`;
    }

    const at = row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at ?? "");
    const event_action: "create" | "update" = isUpdate ? "update" : "create";
    return {
      id: `${kind}-${row.entity_id}-${event_action}-${at}`,
      kind,
      event_action,
      occurred_at: at,
      formation_label: fl,
      owner_username: String(row.owner_username ?? ""),
      line_ar,
    };
  });
}
