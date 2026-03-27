import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

export type CollegeSubjectRow = {
  id: string;
  owner_user_id: string;
  branch_type: "DEPARTMENT" | "BRANCH";
  branch_name: string;
  branch_head_name: string;
  created_at: Date;
  updated_at: Date;
};

export async function listCollegeSubjectsByOwner(ownerUserId: string): Promise<CollegeSubjectRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string | number;
    owner_user_id: string | number;
    branch_type: string;
    branch_name: string;
    branch_head_name: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, owner_user_id, COALESCE(branch_type, 'DEPARTMENT') AS branch_type,
            branch_name, branch_head_name, created_at, updated_at
     FROM college_subjects
     WHERE owner_user_id = $1
     ORDER BY created_at DESC`,
    [ownerUserId]
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    owner_user_id: String(row.owner_user_id),
    branch_type: row.branch_type === "BRANCH" ? "BRANCH" : "DEPARTMENT",
    branch_name: row.branch_name,
    branch_head_name: row.branch_head_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function createCollegeSubject(input: {
  ownerUserId: string;
  branchType: "DEPARTMENT" | "BRANCH";
  branchName: string;
  branchHeadName: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const branchName = input.branchName.trim();
  const branchHeadName = input.branchHeadName.trim();
  const branchType = input.branchType === "BRANCH" ? "BRANCH" : "DEPARTMENT";
  if (branchName.length < 2) return { ok: false, message: "اسم القسم أو الفرع يجب أن يكون حرفين على الأقل." };
  if (branchHeadName.length < 2) return { ok: false, message: "اسم رئيس القسم يجب أن يكون حرفين على الأقل." };
  await ensureCoreSchema();
  const pool = getDbPool();
  const dup = await pool.query<{ exists: number }>(
    `SELECT 1 AS exists
     FROM college_subjects
     WHERE owner_user_id = $1 AND LOWER(TRIM(branch_name)) = LOWER(TRIM($2))
     LIMIT 1`,
    [input.ownerUserId, branchName]
  );
  if ((dup.rowCount ?? 0) > 0) {
    return { ok: false, message: "هذا القسم/الفرع موجود مسبقًا." };
  }
  await pool.query(
    `INSERT INTO college_subjects (owner_user_id, branch_type, branch_name, branch_head_name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())`,
    [input.ownerUserId, branchType, branchName, branchHeadName]
  );
  return { ok: true };
}

export async function updateCollegeSubject(input: {
  id: string;
  ownerUserId: string;
  branchType: "DEPARTMENT" | "BRANCH";
  branchName: string;
  branchHeadName: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const branchName = input.branchName.trim();
  const branchHeadName = input.branchHeadName.trim();
  const branchType = input.branchType === "BRANCH" ? "BRANCH" : "DEPARTMENT";
  if (branchName.length < 2) return { ok: false, message: "اسم القسم أو الفرع يجب أن يكون حرفين على الأقل." };
  if (branchHeadName.length < 2) return { ok: false, message: "اسم رئيس القسم يجب أن يكون حرفين على الأقل." };
  await ensureCoreSchema();
  const pool = getDbPool();
  const dup = await pool.query(
    `SELECT 1
     FROM college_subjects
     WHERE owner_user_id = $1
       AND id <> $2
       AND LOWER(TRIM(branch_name)) = LOWER(TRIM($3))
     LIMIT 1`,
    [input.ownerUserId, input.id, branchName]
  );
  if ((dup.rowCount ?? 0) > 0) {
    return { ok: false, message: "اسم القسم/الفرع مستخدم مسبقًا." };
  }
  const r = await pool.query(
    `UPDATE college_subjects
     SET branch_type = $1, branch_name = $2, branch_head_name = $3, updated_at = NOW()
     WHERE id = $4 AND owner_user_id = $5`,
    [branchType, branchName, branchHeadName, input.id, input.ownerUserId]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "العنصر غير موجود أو لا تملك صلاحية تعديله." };
  return { ok: true };
}

export async function deleteCollegeSubject(input: {
  id: string;
  ownerUserId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query(`DELETE FROM college_subjects WHERE id = $1 AND owner_user_id = $2`, [
    input.id,
    input.ownerUserId,
  ]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "العنصر غير موجود أو لا تملك صلاحية حذفه." };
  return { ok: true };
}
