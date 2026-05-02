import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import type { FollowupDaySaveHint } from "@/lib/followup-day-save-hint";
import { normalizeFollowupExamDateKey } from "@/lib/followup-exam-date-key";
import { ensureCoreSchema } from "@/lib/schema";

export { normalizeFollowupExamDateKey } from "@/lib/followup-exam-date-key";
export type { FollowupDaySaveHint } from "@/lib/followup-day-save-hint";

export type FollowupSavedDayReportListRow = {
  id: string;
  exam_date: string;
  saved_at: Date;
  has_meal_1: boolean;
  has_meal_2: boolean;
  has_both_meals: boolean;
  /** أحدث وقت «تأكيد رفع الموقف» ضمناً عند آخر حفظ/دمج — لمقارنة المواقف الجديدة لاحقاً */
  snapshot_max_head_submitted_at: Date | null;
};

/** مفتاح وحيد لأرشيف «متابعة المواقف» لكل مادة/قسم فرعي تحت نفس مالك التشكيل. */
export function followupDepartmentScopeKey(
  collegeSubjectId: string,
  scopedBranchName: string | null | undefined
): string {
  return `${collegeSubjectId.trim()}::${(scopedBranchName ?? "").trim()}`;
}

export type ListFollowupSavedDayReportsOpts = {
  limit?: number;
  /**
   * بدون هذا الحقل: تقارير عميد التشكيل فقط (`department_scope_key IS NULL`).
   * مع قيمة: تقارير هذا القسم/المادة فقط.
   */
  departmentScopeKey?: string;
};

export async function hasFollowupSavedReportForOwnerExamDate(
  ownerUserId: string,
  examDate: string,
  departmentScopeKey?: string
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  await ensureCoreSchema();
  const pool = getDbPool();
  const key = departmentScopeKey?.trim();
  if (key) {
    const r = await pool.query(
      `SELECT 1 FROM college_followup_saved_day_reports
       WHERE owner_user_id = $1 AND exam_date = $2::date AND department_scope_key = $3
       LIMIT 1`,
      [ownerUserId, d, key]
    );
    return (r.rowCount ?? 0) > 0;
  }
  const r = await pool.query(
    `SELECT 1 FROM college_followup_saved_day_reports
     WHERE owner_user_id = $1 AND exam_date = $2::date AND department_scope_key IS NULL
     LIMIT 1`,
    [ownerUserId, d]
  );
  return (r.rowCount ?? 0) > 0;
}

/** أحدث `head_submitted_at` لجلسات هذا اليوم ذات موقف مرفوع (ضمن نطاق المادة/القسم عند التمرير). */
export async function getMaxHeadSubmittedAtForOwnerExamDate(
  ownerUserId: string,
  examDate: string,
  restrictCollegeSubjectId?: string | null,
  restrictBranchName?: string | null
): Promise<Date | null> {
  if (!isDatabaseConfigured()) return null;
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  await ensureCoreSchema();
  const pool = getDbPool();
  const rid = restrictCollegeSubjectId?.trim();
  const branch = restrictBranchName?.trim();
  const r = branch
    ? await pool.query<{ mx: Date | null }>(
        `SELECT MAX(rep.head_submitted_at) AS mx
         FROM college_exam_schedules e
         INNER JOIN college_subjects csub ON csub.id = e.college_subject_id
         INNER JOIN college_exam_situation_reports rep
                ON rep.exam_schedule_id = e.id AND rep.owner_user_id = e.owner_user_id
         WHERE e.owner_user_id = $1
           AND e.exam_date = $2::date
           AND e.college_subject_id = $3::bigint
           AND TRIM(COALESCE(csub.branch_name::text, '')) = $4
           AND UPPER(TRIM(COALESCE(e.workflow_status::text, 'DRAFT'))) IN ('SUBMITTED', 'APPROVED')
           AND rep.head_submitted_at IS NOT NULL`,
        [ownerUserId, d, rid, branch]
      )
    : rid
      ? await pool.query<{ mx: Date | null }>(
          `SELECT MAX(rep.head_submitted_at) AS mx
           FROM college_exam_schedules e
           INNER JOIN college_exam_situation_reports rep
                  ON rep.exam_schedule_id = e.id AND rep.owner_user_id = e.owner_user_id
           WHERE e.owner_user_id = $1
             AND e.exam_date = $2::date
             AND e.college_subject_id = $3::bigint
             AND UPPER(TRIM(COALESCE(e.workflow_status::text, 'DRAFT'))) IN ('SUBMITTED', 'APPROVED')
             AND rep.head_submitted_at IS NOT NULL`,
          [ownerUserId, d, rid]
        )
      : await pool.query<{ mx: Date | null }>(
          `SELECT MAX(rep.head_submitted_at) AS mx
           FROM college_exam_schedules e
           INNER JOIN college_exam_situation_reports rep
                  ON rep.exam_schedule_id = e.id AND rep.owner_user_id = e.owner_user_id
           WHERE e.owner_user_id = $1
             AND e.exam_date = $2::date
             AND UPPER(TRIM(COALESCE(e.workflow_status::text, 'DRAFT'))) IN ('SUBMITTED', 'APPROVED')
             AND rep.head_submitted_at IS NOT NULL`,
          [ownerUserId, d]
        );
  const mx = r.rows[0]?.mx;
  if (!mx) return null;
  return mx instanceof Date ? mx : new Date(String(mx));
}

export async function buildFollowupDaySaveHintsForOwner(params: {
  ownerUserId: string;
  savedRows: FollowupSavedDayReportListRow[];
  examDates: string[];
  restrictCollegeSubjectId?: string | null;
  restrictBranchName?: string | null;
}): Promise<Record<string, FollowupDaySaveHint>> {
  const out: Record<string, FollowupDaySaveHint> = {};
  for (const raw of params.examDates) {
    const dayKey = normalizeFollowupExamDateKey(raw);
    const saved = params.savedRows.find((s) => normalizeFollowupExamDateKey(s.exam_date) === dayKey);
    const currentMax = await getMaxHeadSubmittedAtForOwnerExamDate(
      params.ownerUserId,
      dayKey,
      params.restrictCollegeSubjectId,
      params.restrictBranchName
    );
    const hasArchivedRow = Boolean(saved);
    let allowMergeSave = true;
    if (!saved) {
      allowMergeSave = Boolean(currentMax);
    } else if (saved.snapshot_max_head_submitted_at) {
      const snap = new Date(saved.snapshot_max_head_submitted_at);
      allowMergeSave = Boolean(currentMax && currentMax.getTime() > snap.getTime());
    } else {
      // صف قديم بلا لقطة زمنية: نسمح بدمج/تحديث حتى يُملأ العمود
      allowMergeSave = Boolean(currentMax);
    }
    out[dayKey] = { hasArchivedRow, allowMergeSave };
  }
  return out;
}

export async function upsertFollowupSavedDayReport(input: {
  ownerUserId: string;
  examDate: string;
  meal1Html: string | null;
  meal2Html: string | null;
  bothMealsHtml: string | null;
  snapshotMaxHeadSubmittedAt: Date | null;
  /** undefined = عميد التشكيل؛ نص = بوابة قسم */
  departmentScopeKey?: string | null;
}): Promise<{ ok: true; id: string; merged: boolean } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const d = input.examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, message: "صيغة التاريخ غير صالحة." };
  if (!input.meal1Html && !input.meal2Html && !input.bothMealsHtml) {
    return { ok: false, message: "لا يوجد تقرير لحفظه لهذا اليوم." };
  }
  await ensureCoreSchema();
  const rawScope = input.departmentScopeKey;
  const scopeKey =
    typeof rawScope === "string" && rawScope.trim().length > 0 ? rawScope.trim() : null;
  const pool = getDbPool();
  const snap = input.snapshotMaxHeadSubmittedAt;

  const upd = scopeKey
    ? await pool.query<{ id: string }>(
        `UPDATE college_followup_saved_day_reports
         SET meal_1_html = $1,
             meal_2_html = $2,
             both_meals_html = $3,
             saved_at = NOW(),
             snapshot_max_head_submitted_at = $4
         WHERE owner_user_id = $5 AND exam_date = $6::date AND department_scope_key = $7
         RETURNING id::text`,
        [input.meal1Html, input.meal2Html, input.bothMealsHtml, snap, input.ownerUserId, d, scopeKey]
      )
    : await pool.query<{ id: string }>(
        `UPDATE college_followup_saved_day_reports
         SET meal_1_html = $1,
             meal_2_html = $2,
             both_meals_html = $3,
             saved_at = NOW(),
             snapshot_max_head_submitted_at = $4
         WHERE owner_user_id = $5 AND exam_date = $6::date AND department_scope_key IS NULL
         RETURNING id::text`,
        [input.meal1Html, input.meal2Html, input.bothMealsHtml, snap, input.ownerUserId, d]
      );
  const updId = upd.rows[0]?.id;
  if (updId && (upd.rowCount ?? 0) > 0) {
    return { ok: true, id: updId, merged: true };
  }

  const ins = await pool.query<{ id: string }>(
    `INSERT INTO college_followup_saved_day_reports
       (owner_user_id, exam_date, meal_1_html, meal_2_html, both_meals_html, department_scope_key, snapshot_max_head_submitted_at)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7)
     RETURNING id::text`,
    [
      input.ownerUserId,
      d,
      input.meal1Html,
      input.meal2Html,
      input.bothMealsHtml,
      scopeKey && scopeKey.length > 0 ? scopeKey : null,
      snap,
    ]
  );
  const id = ins.rows[0]?.id;
  if (!id) return { ok: false, message: "تعذر حفظ السجل." };
  return { ok: true, id, merged: false };
}

export async function listFollowupSavedDayReportsForOwner(
  ownerUserId: string,
  opts: ListFollowupSavedDayReportsOpts = {}
): Promise<FollowupSavedDayReportListRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const lim = Math.min(500, Math.max(1, Math.floor(opts.limit ?? 200)));
  const key = opts.departmentScopeKey?.trim();
  const r = key
    ? await pool.query<{
        id: string;
        exam_date: string;
        saved_at: Date;
        meal_1_html: string | null;
        meal_2_html: string | null;
        both_meals_html: string | null;
        snapshot_max_head_submitted_at: Date | null;
      }>(
        `SELECT id::text, exam_date::text, saved_at,
                meal_1_html, meal_2_html, both_meals_html,
                snapshot_max_head_submitted_at
         FROM college_followup_saved_day_reports
         WHERE owner_user_id = $1 AND department_scope_key = $2
         ORDER BY saved_at DESC
         LIMIT $3`,
        [ownerUserId, key, lim]
      )
    : await pool.query<{
        id: string;
        exam_date: string;
        saved_at: Date;
        meal_1_html: string | null;
        meal_2_html: string | null;
        both_meals_html: string | null;
        snapshot_max_head_submitted_at: Date | null;
      }>(
        `SELECT id::text, exam_date::text, saved_at,
                meal_1_html, meal_2_html, both_meals_html,
                snapshot_max_head_submitted_at
         FROM college_followup_saved_day_reports
         WHERE owner_user_id = $1 AND department_scope_key IS NULL
         ORDER BY saved_at DESC
         LIMIT $2`,
        [ownerUserId, lim]
      );
  return r.rows.map((row) => ({
    id: row.id,
    exam_date: normalizeFollowupExamDateKey(row.exam_date as string | Date),
    saved_at: row.saved_at,
    has_meal_1: Boolean(row.meal_1_html && row.meal_1_html.length > 0),
    has_meal_2: Boolean(row.meal_2_html && row.meal_2_html.length > 0),
    has_both_meals: Boolean(row.both_meals_html && row.both_meals_html.length > 0),
    snapshot_max_head_submitted_at: row.snapshot_max_head_submitted_at
      ? row.snapshot_max_head_submitted_at instanceof Date
        ? row.snapshot_max_head_submitted_at
        : new Date(String(row.snapshot_max_head_submitted_at))
      : null,
  }));
}

export type SavedReportPart = "meal1" | "meal2" | "both";

export async function getFollowupSavedDayReportHtmlForOwner(
  ownerUserId: string,
  reportId: string,
  part: SavedReportPart,
  departmentScopeKey?: string
): Promise<{ ok: true; html: string } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  if (!/^\d+$/.test(reportId.trim())) return { ok: false, message: "معرّف غير صالح." };
  await ensureCoreSchema();
  const pool = getDbPool();
  const key = departmentScopeKey?.trim();
  const r = key
    ? await pool.query<{ html: string | null }>(
        `SELECT CASE $4::text
           WHEN 'meal1' THEN meal_1_html
           WHEN 'meal2' THEN meal_2_html
           WHEN 'both' THEN both_meals_html
         END AS html
         FROM college_followup_saved_day_reports
         WHERE id = $1::bigint AND owner_user_id = $2 AND department_scope_key = $3`,
        [reportId.trim(), ownerUserId, key, part]
      )
    : await pool.query<{ html: string | null }>(
        `SELECT CASE $3::text
           WHEN 'meal1' THEN meal_1_html
           WHEN 'meal2' THEN meal_2_html
           WHEN 'both' THEN both_meals_html
         END AS html
         FROM college_followup_saved_day_reports
         WHERE id = $1::bigint AND owner_user_id = $2 AND department_scope_key IS NULL`,
        [reportId.trim(), ownerUserId, part]
      );
  const html = r.rows[0]?.html?.trim() ?? "";
  if (!html) return { ok: false, message: "هذا الجزء غير محفوظ في السجل." };
  return { ok: true, html };
}

export async function deleteFollowupSavedDayReportForOwner(
  ownerUserId: string,
  reportId: string,
  departmentScopeKey?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  if (!/^\d+$/.test(reportId.trim())) return { ok: false, message: "معرّف غير صالح." };
  await ensureCoreSchema();
  const pool = getDbPool();
  const key = departmentScopeKey?.trim();
  const r = key
    ? await pool.query(
        `DELETE FROM college_followup_saved_day_reports WHERE id = $1::bigint AND owner_user_id = $2 AND department_scope_key = $3`,
        [reportId.trim(), ownerUserId, key]
      )
    : await pool.query(
        `DELETE FROM college_followup_saved_day_reports WHERE id = $1::bigint AND owner_user_id = $2 AND department_scope_key IS NULL`,
        [reportId.trim(), ownerUserId]
      );
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "لم يُعثر على السجل أو غير مصرح." };
  return { ok: true };
}
