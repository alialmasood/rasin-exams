import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

export type FollowupSavedDayReportListRow = {
  id: string;
  exam_date: string;
  saved_at: Date;
  has_meal_1: boolean;
  has_meal_2: boolean;
  has_both_meals: boolean;
};

export async function hasFollowupSavedReportForOwnerExamDate(
  ownerUserId: string,
  examDate: string
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query(
    `SELECT 1 FROM college_followup_saved_day_reports
     WHERE owner_user_id = $1 AND exam_date = $2::date
     LIMIT 1`,
    [ownerUserId, d]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function insertFollowupSavedDayReport(input: {
  ownerUserId: string;
  examDate: string;
  meal1Html: string | null;
  meal2Html: string | null;
  bothMealsHtml: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const d = input.examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, message: "صيغة التاريخ غير صالحة." };
  if (!input.meal1Html && !input.meal2Html && !input.bothMealsHtml) {
    return { ok: false, message: "لا يوجد تقرير لحفظه لهذا اليوم." };
  }
  await ensureCoreSchema();
  if (await hasFollowupSavedReportForOwnerExamDate(input.ownerUserId, d)) {
    return {
      ok: false,
      message:
        "تم حفظ الموقف لهذا اليوم مسبقاً. راجع «التقارير المحفوظة» أدناه، أو احذف السجل المحفوظ إن أردت إعادة الحفظ.",
    };
  }
  const pool = getDbPool();
  const r = await pool.query<{ id: string }>(
    `INSERT INTO college_followup_saved_day_reports
       (owner_user_id, exam_date, meal_1_html, meal_2_html, both_meals_html)
     VALUES ($1, $2::date, $3, $4, $5)
     RETURNING id::text`,
    [input.ownerUserId, d, input.meal1Html, input.meal2Html, input.bothMealsHtml]
  );
  const id = r.rows[0]?.id;
  if (!id) return { ok: false, message: "تعذر حفظ السجل." };
  return { ok: true, id };
}

export async function listFollowupSavedDayReportsForOwner(
  ownerUserId: string,
  limit = 200
): Promise<FollowupSavedDayReportListRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const lim = Math.min(500, Math.max(1, Math.floor(limit)));
  const r = await pool.query<{
    id: string;
    exam_date: string;
    saved_at: Date;
    meal_1_html: string | null;
    meal_2_html: string | null;
    both_meals_html: string | null;
  }>(
    `SELECT id::text, exam_date::text, saved_at,
            meal_1_html, meal_2_html, both_meals_html
     FROM college_followup_saved_day_reports
     WHERE owner_user_id = $1
     ORDER BY saved_at DESC
     LIMIT $2`,
    [ownerUserId, lim]
  );
  return r.rows.map((row) => ({
    id: row.id,
    exam_date: row.exam_date,
    saved_at: row.saved_at,
    has_meal_1: Boolean(row.meal_1_html && row.meal_1_html.length > 0),
    has_meal_2: Boolean(row.meal_2_html && row.meal_2_html.length > 0),
    has_both_meals: Boolean(row.both_meals_html && row.both_meals_html.length > 0),
  }));
}

export type SavedReportPart = "meal1" | "meal2" | "both";

export async function getFollowupSavedDayReportHtmlForOwner(
  ownerUserId: string,
  reportId: string,
  part: SavedReportPart
): Promise<{ ok: true; html: string } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  if (!/^\d+$/.test(reportId.trim())) return { ok: false, message: "معرّف غير صالح." };
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{ html: string | null }>(
    `SELECT CASE $3::text
       WHEN 'meal1' THEN meal_1_html
       WHEN 'meal2' THEN meal_2_html
       WHEN 'both' THEN both_meals_html
     END AS html
     FROM college_followup_saved_day_reports
     WHERE id = $1::bigint AND owner_user_id = $2`,
    [reportId.trim(), ownerUserId, part]
  );
  const html = r.rows[0]?.html?.trim() ?? "";
  if (!html) return { ok: false, message: "هذا الجزء غير محفوظ في السجل." };
  return { ok: true, html };
}

export async function deleteFollowupSavedDayReportForOwner(
  ownerUserId: string,
  reportId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  if (!/^\d+$/.test(reportId.trim())) return { ok: false, message: "معرّف غير صالح." };
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query(`DELETE FROM college_followup_saved_day_reports WHERE id = $1::bigint AND owner_user_id = $2`, [
    reportId.trim(),
    ownerUserId,
  ]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "لم يُعثر على السجل أو غير مصرح." };
  return { ok: true };
}
