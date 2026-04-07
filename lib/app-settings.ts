import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

/** إظهار زر «رفع الموقف الامتحاني» الكبير في /dashboard/college */
export const SHOW_COLLEGE_EXAM_SITUATION_UPLOAD_CTA_KEY = "show_college_exam_situation_upload_cta";

function parseBooleanSetting(raw: string | null | undefined, defaultVal: boolean): boolean {
  if (raw == null || raw === "") return defaultVal;
  const s = raw.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return defaultVal;
}

export async function getShowCollegeExamSituationUploadCta(): Promise<boolean> {
  if (!isDatabaseConfigured()) return true;
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{ setting_value: string }>(
    `SELECT setting_value FROM app_settings WHERE setting_key = $1`,
    [SHOW_COLLEGE_EXAM_SITUATION_UPLOAD_CTA_KEY]
  );
  return parseBooleanSetting(r.rows[0]?.setting_value, true);
}

export async function setShowCollegeExamSituationUploadCta(value: boolean, actorUserId: string): Promise<void> {
  await ensureCoreSchema();
  const pool = getDbPool();
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_at, updated_by)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (setting_key) DO UPDATE SET
       setting_value = EXCLUDED.setting_value,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by`,
    [SHOW_COLLEGE_EXAM_SITUATION_UPLOAD_CTA_KEY, value ? "true" : "false", actorUserId]
  );
}
