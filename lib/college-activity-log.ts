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

/** سطر يُعرَض في الشريط الجانبي لبوابة القسم — تحفيز بإنجازات الأقسام/مصادقة العميد */
export type DepartmentPortalMotivationLine = {
  id: string;
  kind: "branch_approved" | "dean_confirmed";
  message: string;
  scheduleId: string | null;
  createdAtIso: string;
};

function detailString(d: Record<string, unknown> | null, key: string): string {
  if (!d) return "";
  const v = d[key];
  return typeof v === "string" ? v.trim() : "";
}

export function motivationLineFromActivityRow(row: CollegeActivityLogRow): DepartmentPortalMotivationLine | null {
  const d = row.details;
  const scheduleId = detailString(d, "scheduleId");
  const branchName = detailString(d, "branchName");

  if (row.resource === "situation_report" && row.action === "approve") {
    const scope = branchName ? `قسم/فرع «${branchName}»` : "أحد الأقسام أو الفروع";
    return {
      id: row.id,
      kind: "branch_approved",
      message: `${scope} اعتمد الموقف الامتحاني.`,
      scheduleId: scheduleId || null,
      createdAtIso: row.created_at.toISOString(),
    };
  }
  if (row.resource === "situation_official_upload" && row.action === "submit") {
    const scope = branchName ? `جلسة لـ «${branchName}»` : "جلسة امتحانية";
    return {
      id: row.id,
      kind: "dean_confirmed",
      message: `تم تأكيد رفع الموقف رسمياً (مصادقة عميد التشكيل) — ${scope}.`,
      scheduleId: scheduleId || null,
      createdAtIso: row.created_at.toISOString(),
    };
  }
  return null;
}

/** آخر الأحداث المرتبطة بالموقف الامتحاني لعرضها في بوابة القسم */
export async function listDepartmentPortalMotivationFeed(
  ownerUserId: string,
  limit = 6
): Promise<DepartmentPortalMotivationLine[]> {
  const rows = await listCollegeActivityLogForOwner(ownerUserId, 200);
  const out: DepartmentPortalMotivationLine[] = [];
  for (const r of rows) {
    const line = motivationLineFromActivityRow(r);
    if (line) out.push(line);
    if (out.length >= limit) break;
  }
  return out;
}
