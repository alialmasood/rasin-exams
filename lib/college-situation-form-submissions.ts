import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";
import type { StatusFollowupFormRow } from "@/lib/college-exam-situations";
import {
  type SituationFormPayloadV1,
  validateSituationFormPayload,
} from "@/lib/situation-form-payload";

export async function insertSituationFormSubmission(input: {
  ownerUserId: string;
  collegeLabelSnapshot: string;
  payload: SituationFormPayloadV1;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{ id: string }>(
    `INSERT INTO college_situation_form_submissions (owner_user_id, college_label_snapshot, payload, submitted_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     RETURNING id::text AS id`,
    [input.ownerUserId, input.collegeLabelSnapshot.trim() || "—", JSON.stringify(input.payload)]
  );
  const id = r.rows[0]?.id;
  if (!id) return { ok: false, message: "تعذر حفظ السجل." };
  return { ok: true, id };
}

export async function listSubmittedSituationFormsForOwner(
  ownerUserId: string
): Promise<StatusFollowupFormRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string;
    submitted_at: Date;
    payload: unknown;
  }>(
    `SELECT id::text AS id, submitted_at, payload
     FROM college_situation_form_submissions
     WHERE owner_user_id = $1
     ORDER BY submitted_at DESC`,
    [ownerUserId]
  );
  const out: StatusFollowupFormRow[] = [];
  for (const row of r.rows) {
    const v = validateSituationFormPayload(row.payload, { forSubmit: false });
    if (!v.ok) continue;
    const p = v.data;
    out.push({
      kind: "form",
      form_submission_id: row.id,
      exam_date: p.examDate,
      subject_name: p.subject,
      stage_display: p.stage,
      branch_name: p.department,
      submitted_at_iso: row.submitted_at.toISOString(),
    });
  }
  return out;
}

export async function getSituationFormSubmissionForOwner(
  ownerUserId: string,
  submissionId: string
): Promise<{ submitted_at: Date; payload: SituationFormPayloadV1 } | null> {
  if (!isDatabaseConfigured()) return null;
  await ensureCoreSchema();
  if (!/^\d+$/.test(submissionId.trim())) return null;
  const pool = getDbPool();
  const r = await pool.query<{ submitted_at: Date; payload: unknown }>(
    `SELECT submitted_at, payload
     FROM college_situation_form_submissions
     WHERE owner_user_id = $1 AND id = $2::bigint
     LIMIT 1`,
    [ownerUserId, submissionId.trim()]
  );
  const row = r.rows[0];
  if (!row) return null;
  const v = validateSituationFormPayload(row.payload, { forSubmit: false });
  if (!v.ok) return null;
  return { submitted_at: row.submitted_at, payload: v.data };
}

export async function deleteSituationFormSubmissionForOwner(
  ownerUserId: string,
  submissionId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  if (!/^\d+$/.test(submissionId.trim())) return { ok: false, message: "معرّف غير صالح." };
  const pool = getDbPool();
  const del = await pool.query(
    `DELETE FROM college_situation_form_submissions
     WHERE owner_user_id = $1 AND id = $2::bigint
     RETURNING id`,
    [ownerUserId, submissionId.trim()]
  );
  if ((del.rowCount ?? 0) === 0) {
    return { ok: false, message: "السجل غير موجود أو ليس لديك صلاحية." };
  }
  return { ok: true };
}

/** صف موقف نموذج لعرض المدير — بعد التحقق من الحمولة. */
export type AdminSituationFormSubmissionView = {
  id: string;
  ownerUserId: string;
  formationLabel: string;
  ownerUsername: string;
  collegeLabelSnapshot: string;
  submittedAtIso: string;
  payload: SituationFormPayloadV1;
};

/**
 * كل المواقف المرسلة من نموذج «رفع الموقف الامتحاني» عبر حسابات التشكيل — للوحة المدير.
 */
export async function listAllSituationFormSubmissionsForAdmin(): Promise<AdminSituationFormSubmissionView[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string;
    owner_user_id: string;
    college_label_snapshot: string;
    submitted_at: Date;
    payload: unknown;
    owner_username: string;
    formation_label: string;
  }>(
    `SELECT s.id::text AS id, s.owner_user_id::text AS owner_user_id,
            s.college_label_snapshot, s.submitted_at, s.payload,
            u.username::text AS owner_username,
            COALESCE(
              NULLIF(TRIM(
                CASE
                  WHEN UPPER(COALESCE(p.account_kind::text, 'FORMATION')) = 'FOLLOWUP'
                    THEN COALESCE(p.holder_name, '')
                  ELSE COALESCE(p.formation_name, '')
                END
              ), ''),
              u.username::text
            ) AS formation_label
     FROM college_situation_form_submissions s
     INNER JOIN users u ON u.id = s.owner_user_id AND u.deleted_at IS NULL AND u.role = 'COLLEGE'
     LEFT JOIN college_account_profiles p ON p.user_id = u.id
     ORDER BY (s.payload->>'examDate') DESC NULLS LAST,
              formation_label ASC,
              s.submitted_at DESC`
  );

  const out: AdminSituationFormSubmissionView[] = [];
  for (const row of r.rows) {
    const v = validateSituationFormPayload(row.payload, { forSubmit: false });
    if (!v.ok) continue;
    out.push({
      id: row.id,
      ownerUserId: row.owner_user_id,
      formationLabel: row.formation_label,
      ownerUsername: row.owner_username,
      collegeLabelSnapshot: row.college_label_snapshot,
      submittedAtIso: row.submitted_at.toISOString(),
      payload: v.data,
    });
  }
  return out;
}
