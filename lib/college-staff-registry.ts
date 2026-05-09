import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";
import type { CollegeStaffRegistryRow, StaffRegistryRoleKind } from "@/lib/staff-registry-shared";

export {
  STAFF_REGISTRY_ALL_BRANCHES_VALUE,
  type CollegeStaffRegistryRow,
  type StaffRegistryRoleKind,
} from "@/lib/staff-registry-shared";

function normalizeRoleKind(raw: string | null | undefined): StaffRegistryRoleKind | null {
  const u = String(raw ?? "").trim().toUpperCase();
  if (!u) return null;
  if (u === "SUPERVISOR") return "SUPERVISOR";
  if (u === "INVIGILATOR") return "INVIGILATOR";
  return null;
}

/** قائمة المشرفين والمراقبين المسجّلين لنطاق التشكيل/القسم. */
export async function listCollegeStaffRegistryForOwner(
  ownerUserId: string,
  restrictCollegeSubjectId?: string | null
): Promise<CollegeStaffRegistryRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const rid = restrictCollegeSubjectId?.trim();
  const allBranchesLabel = "كل الأقسام والفروع";
  const r = await pool.query<{
    id: string | number;
    owner_user_id: string;
    college_subject_id: string | number | null;
    branch_name: string;
    branch_type: string;
    full_name: string;
    role_kind: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    rid
      ? `SELECT r.id, r.owner_user_id::text AS owner_user_id, r.college_subject_id::text AS college_subject_id,
                COALESCE(c.branch_name, $3) AS branch_name, COALESCE(c.branch_type, 'DEPARTMENT') AS branch_type,
                r.full_name, r.role_kind, r.created_at, r.updated_at
         FROM college_staff_registry r
         LEFT JOIN college_subjects c ON c.id = r.college_subject_id
         WHERE r.owner_user_id = $1 AND r.college_subject_id = $2::bigint
         ORDER BY r.full_name ASC, r.id ASC`
      : `SELECT r.id, r.owner_user_id::text AS owner_user_id, r.college_subject_id::text AS college_subject_id,
                COALESCE(c.branch_name, $2) AS branch_name, COALESCE(c.branch_type, 'DEPARTMENT') AS branch_type,
                r.full_name, r.role_kind, r.created_at, r.updated_at
         FROM college_staff_registry r
         LEFT JOIN college_subjects c ON c.id = r.college_subject_id
         WHERE r.owner_user_id = $1
         ORDER BY CASE WHEN r.college_subject_id IS NULL THEN 0 ELSE 1 END,
                  COALESCE(c.branch_name, '') ASC,
                  r.full_name ASC, r.id ASC`,
    rid ? [ownerUserId, rid, allBranchesLabel] : [ownerUserId, allBranchesLabel]
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    owner_user_id: String(row.owner_user_id),
    college_subject_id: row.college_subject_id != null ? String(row.college_subject_id) : null,
    branch_name: row.branch_name,
    branch_type: row.branch_type === "BRANCH" ? "BRANCH" : "DEPARTMENT",
    full_name: row.full_name,
    role_kind: normalizeRoleKind(row.role_kind),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function insertCollegeStaffRegistryRow(input: {
  ownerUserId: string;
  /** `null` = ينطبق على جميع أقسام/فروع التشكيل (حساب مركزي فقط) */
  collegeSubjectId: string | null;
  fullName: string;
  /** اختياري — السجل مرجعي للأسماء دون تصنيف إلزامي */
  roleKind?: StaffRegistryRoleKind | null;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const fullName = input.fullName.trim();
  if (fullName.length < 2) return { ok: false, message: "الاسم الكامل يجب أن يكون حرفين على الأقل." };
  if (fullName.length > 200) return { ok: false, message: "الاسم طويل جداً." };
  const role =
    input.roleKind === undefined || input.roleKind === null
      ? null
      : normalizeRoleKind(input.roleKind);
  const rawSid = input.collegeSubjectId?.trim() ?? "";
  const sid: string | null = rawSid === "" ? null : rawSid;
  if (sid !== null && !/^\d+$/.test(sid)) return { ok: false, message: "معرّف القسم/الفرع غير صالح." };
  await ensureCoreSchema();
  const pool = getDbPool();
  if (sid !== null) {
    const subOk = await pool.query<{ ok: number }>(
      `SELECT 1 AS ok FROM college_subjects WHERE owner_user_id = $1 AND id = $2::bigint LIMIT 1`,
      [input.ownerUserId, sid]
    );
    if ((subOk.rowCount ?? 0) === 0) {
      return { ok: false, message: "القسم/الفرع غير موجود ضمن تشكيلك." };
    }
  }
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO college_staff_registry (owner_user_id, college_subject_id, full_name, role_kind, created_at, updated_at)
     VALUES ($1, $2::bigint, $3, $4, NOW(), NOW())
     RETURNING id::text AS id`,
    [input.ownerUserId, sid, fullName, role]
  );
  const id = ins.rows[0]?.id;
  if (!id) return { ok: false, message: "تعذّر حفظ السجل." };
  return { ok: true, id };
}

export async function updateCollegeStaffRegistryRow(input: {
  ownerUserId: string;
  id: string;
  collegeSubjectId: string | null;
  fullName: string;
  roleKind?: StaffRegistryRoleKind | null;
  /** عند حساب قسم واحد — يُقيَّد التحديث على صفوف هذا الفرع فقط */
  restrictCollegeSubjectId?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const rowId = input.id.trim();
  if (!/^\d+$/.test(rowId)) return { ok: false, message: "معرّف السجل غير صالح." };
  const fullName = input.fullName.trim();
  if (fullName.length < 2) return { ok: false, message: "الاسم الكامل يجب أن يكون حرفين على الأقل." };
  if (fullName.length > 200) return { ok: false, message: "الاسم طويل جداً." };
  const role =
    input.roleKind === undefined || input.roleKind === null
      ? null
      : normalizeRoleKind(input.roleKind);
  const rawSid = input.collegeSubjectId?.trim() ?? "";
  const sid: string | null = rawSid === "" ? null : rawSid;
  if (sid !== null && !/^\d+$/.test(sid)) return { ok: false, message: "معرّف القسم/الفرع غير صالح." };
  await ensureCoreSchema();
  const pool = getDbPool();
  if (sid !== null) {
    const subOk = await pool.query<{ ok: number }>(
      `SELECT 1 AS ok FROM college_subjects WHERE owner_user_id = $1 AND id = $2::bigint LIMIT 1`,
      [input.ownerUserId, sid]
    );
    if ((subOk.rowCount ?? 0) === 0) {
      return { ok: false, message: "القسم/الفرع غير موجود ضمن تشكيلك." };
    }
  }
  const rid = input.restrictCollegeSubjectId?.trim();
  const r = rid
    ? await pool.query(
        `UPDATE college_staff_registry
         SET full_name = $1, role_kind = $2, college_subject_id = $3::bigint, updated_at = NOW()
         WHERE id = $4::bigint AND owner_user_id = $5 AND college_subject_id = $6::bigint`,
        [fullName, role, sid, rowId, input.ownerUserId, rid]
      )
    : await pool.query(
        `UPDATE college_staff_registry
         SET full_name = $1, role_kind = $2, college_subject_id = $3::bigint, updated_at = NOW()
         WHERE id = $4::bigint AND owner_user_id = $5`,
        [fullName, role, sid, rowId, input.ownerUserId]
      );
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "تعذّر تحديث السجل أو غير موجود." };
  return { ok: true };
}

export async function deleteCollegeStaffRegistryRow(input: {
  ownerUserId: string;
  id: string;
  /** عند حساب قسم واحد — يُقيَّد الحذف بهذا الفرع فقط */
  restrictCollegeSubjectId?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const id = input.id.trim();
  if (!/^\d+$/.test(id)) return { ok: false, message: "معرّف السجل غير صالح." };
  await ensureCoreSchema();
  const pool = getDbPool();
  const rid = input.restrictCollegeSubjectId?.trim();
  const r = rid
    ? await pool.query(
        `DELETE FROM college_staff_registry
         WHERE id = $1::bigint AND owner_user_id = $2 AND college_subject_id = $3::bigint`,
        [id, input.ownerUserId, rid]
      )
    : await pool.query(
        `DELETE FROM college_staff_registry WHERE id = $1::bigint AND owner_user_id = $2`,
        [id, input.ownerUserId]
      );
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "تعذّر حذف السجل أو غير موجود." };
  return { ok: true };
}
