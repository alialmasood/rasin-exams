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
  createdAtIso: string;
};

function detailString(d: Record<string, unknown> | null, key: string): string {
  if (!d) return "";
  const v = d[key];
  return typeof v === "string" ? v.trim() : "";
}

/** تسمية صريحة للتشكيل و/أو الفرع — بلا صياغات مبهمة */
function motivationEntityLabelFromDetails(d: Record<string, unknown> | null): string | null {
  const bRaw = detailString(d, "branchName");
  const fRaw = detailString(d, "formationLabel");
  const branch = bRaw && bRaw !== "—" ? bRaw : "";
  const formation = fRaw && fRaw !== "—" ? fRaw : "";
  if (formation && branch) return `تشكيل «${formation}» — قسم/فرع «${branch}»`;
  if (branch) return `قسم/فرع «${branch}»`;
  if (formation) return `تشكيل «${formation}»`;
  return null;
}

export function motivationLineFromActivityRow(row: CollegeActivityLogRow): DepartmentPortalMotivationLine | null {
  const d = row.details;
  const label = motivationEntityLabelFromDetails(d);
  if (!label) return null;

  if (row.resource === "situation_report" && row.action === "approve") {
    return {
      id: row.id,
      kind: "branch_approved",
      message: `${label} اعتمد الموقف الامتحاني.`,
      createdAtIso: row.created_at.toISOString(),
    };
  }
  if (row.resource === "situation_official_upload" && row.action === "submit") {
    return {
      id: row.id,
      kind: "dean_confirmed",
      message: `تم تأكيد رفع الموقف رسمياً (مصادقة عميد التشكيل): ${label}.`,
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
  const cutoffMs = Date.now() - 48 * 60 * 60 * 1000;
  const out: DepartmentPortalMotivationLine[] = [];
  for (const r of rows) {
    if (r.created_at.getTime() < cutoffMs) continue;
    const line = motivationLineFromActivityRow(r);
    if (line) out.push(line);
    if (out.length >= limit) break;
  }
  return out;
}
