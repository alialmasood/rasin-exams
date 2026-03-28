import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

export type StudyType = "ANNUAL" | "SEMESTER" | "COURSES" | "BOLOGNA";

export type CollegeStudySubjectRow = {
  id: string;
  owner_user_id: string;
  college_subject_id: string;
  linked_branch_name: string;
  linked_branch_type: "DEPARTMENT" | "BRANCH";
  subject_name: string;
  study_type: StudyType;
  study_stage_level: number;
  created_at: Date;
  updated_at: Date;
};

function normalizeStudyType(value: string): StudyType {
  const v = value.trim().toUpperCase();
  if (v === "SEMESTER") return "SEMESTER";
  if (v === "COURSES") return "COURSES";
  if (v === "BOLOGNA") return "BOLOGNA";
  return "ANNUAL";
}

function normalizeStudyStageLevel(value: string): number {
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > 6) return 1;
  return n;
}

export async function listCollegeStudySubjectsByOwner(ownerUserId: string): Promise<CollegeStudySubjectRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string | number;
    owner_user_id: string | number;
    college_subject_id: string | number;
    linked_branch_name: string;
    linked_branch_type: string;
    subject_name: string;
    study_type: string;
    study_stage_level: number | string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT s.id, s.owner_user_id, s.college_subject_id,
            c.branch_name AS linked_branch_name,
            COALESCE(c.branch_type, 'DEPARTMENT') AS linked_branch_type,
            s.subject_name,
            COALESCE(s.study_type, 'ANNUAL') AS study_type,
            COALESCE(s.study_stage_level, 1) AS study_stage_level,
            s.created_at, s.updated_at
     FROM college_study_subjects s
     INNER JOIN college_subjects c ON c.id = s.college_subject_id
     WHERE s.owner_user_id = $1
     ORDER BY s.created_at DESC`,
    [ownerUserId]
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    owner_user_id: String(row.owner_user_id),
    college_subject_id: String(row.college_subject_id),
    linked_branch_name: row.linked_branch_name,
    linked_branch_type: row.linked_branch_type === "BRANCH" ? "BRANCH" : "DEPARTMENT",
    subject_name: row.subject_name,
    study_type: normalizeStudyType(row.study_type),
    study_stage_level: normalizeStudyStageLevel(String(row.study_stage_level ?? 1)),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function createCollegeStudySubject(input: {
  ownerUserId: string;
  collegeSubjectId: string;
  subjectName: string;
  studyType: string;
  studyStageLevel: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const subjectName = input.subjectName.trim();
  if (subjectName.length < 2) return { ok: false, message: "اسم المادة يجب أن يكون حرفين على الأقل." };
  if (!/^\d+$/.test(input.collegeSubjectId.trim())) {
    return { ok: false, message: "يرجى اختيار قسم/فرع صالح." };
  }
  await ensureCoreSchema();
  const pool = getDbPool();
  const branchExists = await pool.query(
    `SELECT 1 FROM college_subjects WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
    [input.collegeSubjectId.trim(), input.ownerUserId]
  );
  if ((branchExists.rowCount ?? 0) === 0) return { ok: false, message: "القسم/الفرع المحدد غير موجود." };

  const stageLevel = normalizeStudyStageLevel(input.studyStageLevel);

  const dup = await pool.query(
    `SELECT 1
     FROM college_study_subjects
     WHERE owner_user_id = $1
       AND college_subject_id = $2
       AND LOWER(TRIM(subject_name)) = LOWER(TRIM($3))
       AND COALESCE(study_stage_level, 1) = $4
     LIMIT 1`,
    [input.ownerUserId, input.collegeSubjectId.trim(), subjectName, stageLevel]
  );
  if ((dup.rowCount ?? 0) > 0) return { ok: false, message: "هذه المادة موجودة مسبقًا ضمن القسم/الفرع ونفس المرحلة." };

  await pool.query(
    `INSERT INTO college_study_subjects
      (owner_user_id, college_subject_id, subject_name, study_type, study_stage_level, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
    [
      input.ownerUserId,
      input.collegeSubjectId.trim(),
      subjectName,
      normalizeStudyType(input.studyType),
      stageLevel,
    ]
  );
  return { ok: true };
}

export async function updateCollegeStudySubject(input: {
  id: string;
  ownerUserId: string;
  collegeSubjectId: string;
  subjectName: string;
  studyType: string;
  studyStageLevel: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const subjectName = input.subjectName.trim();
  if (!/^\d+$/.test(input.id.trim())) return { ok: false, message: "معرّف المادة غير صالح." };
  if (!/^\d+$/.test(input.collegeSubjectId.trim())) return { ok: false, message: "القسم/الفرع غير صالح." };
  if (subjectName.length < 2) return { ok: false, message: "اسم المادة يجب أن يكون حرفين على الأقل." };
  await ensureCoreSchema();
  const pool = getDbPool();
  const branchExists = await pool.query(
    `SELECT 1 FROM college_subjects WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
    [input.collegeSubjectId.trim(), input.ownerUserId]
  );
  if ((branchExists.rowCount ?? 0) === 0) return { ok: false, message: "القسم/الفرع المحدد غير موجود." };

  const stageLevel = normalizeStudyStageLevel(input.studyStageLevel);

  const dup = await pool.query(
    `SELECT 1
     FROM college_study_subjects
     WHERE owner_user_id = $1
       AND id <> $2
       AND college_subject_id = $3
       AND LOWER(TRIM(subject_name)) = LOWER(TRIM($4))
       AND COALESCE(study_stage_level, 1) = $5
     LIMIT 1`,
    [input.ownerUserId, input.id.trim(), input.collegeSubjectId.trim(), subjectName, stageLevel]
  );
  if ((dup.rowCount ?? 0) > 0) return { ok: false, message: "اسم المادة مستخدم مسبقًا ضمن القسم/الفرع ونفس المرحلة." };

  const r = await pool.query(
    `UPDATE college_study_subjects
     SET college_subject_id = $1, subject_name = $2, study_type = $3, study_stage_level = $4, updated_at = NOW()
     WHERE id = $5 AND owner_user_id = $6`,
    [
      input.collegeSubjectId.trim(),
      subjectName,
      normalizeStudyType(input.studyType),
      stageLevel,
      input.id.trim(),
      input.ownerUserId,
    ]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "المادة غير موجودة أو لا تملك صلاحية تعديلها." };
  return { ok: true };
}

export async function deleteCollegeStudySubject(input: {
  id: string;
  ownerUserId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  if (!/^\d+$/.test(input.id.trim())) return { ok: false, message: "معرّف المادة غير صالح." };
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query(
    `DELETE FROM college_study_subjects WHERE id = $1 AND owner_user_id = $2`,
    [input.id.trim(), input.ownerUserId]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "المادة غير موجودة أو لا تملك صلاحية حذفها." };
  return { ok: true };
}
