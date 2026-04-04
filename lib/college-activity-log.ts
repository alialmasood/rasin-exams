import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

export type CollegeActivityLogRow = {
  id: string;
  action: string;
  resource: string;
  summary: string;
  details: Record<string, unknown> | null;
  created_at: Date;
};

/**
 * تسجيل حدث في سجل الكلية (لا يرمي للأعلى — فشل التسجيل لا يعطل العملية الأساسية).
 */
export async function recordCollegeActivityEvent(params: {
  ownerUserId: string;
  action: string;
  resource: string;
  summary: string;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    await ensureCoreSchema();
    const pool = getDbPool();
    const detailsJson =
      params.details && Object.keys(params.details).length > 0 ? JSON.stringify(params.details) : null;
    await pool.query(
      `INSERT INTO college_activity_log (owner_user_id, action, resource, summary, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        params.ownerUserId,
        params.action.trim().slice(0, 40),
        params.resource.trim().slice(0, 80),
        params.summary.trim().slice(0, 4000),
        detailsJson,
      ]
    );
  } catch (err) {
    console.warn("[college_activity_log] record failed", err);
  }
}

export async function listCollegeActivityLogForOwner(
  ownerUserId: string,
  limit = 400
): Promise<CollegeActivityLogRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const lim = Math.min(1000, Math.max(1, Math.floor(limit)));
  const r = await pool.query<{
    id: string;
    action: string;
    resource: string;
    summary: string;
    details: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT id::text, action, resource, summary, details, created_at
     FROM college_activity_log
     WHERE owner_user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [ownerUserId, lim]
  );
  return r.rows.map((row) => ({
    ...row,
    details:
      row.details && typeof row.details === "object" && !Array.isArray(row.details)
        ? row.details
        : null,
  }));
}
