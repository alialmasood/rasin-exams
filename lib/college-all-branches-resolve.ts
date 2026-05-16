/**
 * استنتاج قسم/فرع عند اختيار «لكل الكلية» — خادم فقط (يستخدم pg).
 */

import { normalizeCollegeRoomDefinitionName } from "@/lib/college-room-definitions-shared";
import { getDbPool, isDatabaseConfigured } from "@/lib/db";

export {
  COLLEGE_WIDE_BRANCH_DISPLAY_AR,
  EXAM_SCHEDULE_ALL_BRANCHES_VALUE,
  isExamScheduleAllBranchesChoice,
  SQL_COLLEGE_SUBJECT_DISPLAY_NAME,
} from "@/lib/college-all-branches-shared";

export async function inferCollegeSubjectIdFromRoomDefinitionsBulk(
  ownerUserId: string,
  roomNames: string[]
): Promise<{ ok: true; collegeSubjectId: string } | { ok: false; message: string }> {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const rn of roomNames) {
    const n = normalizeCollegeRoomDefinitionName(rn);
    if (!n) {
      return {
        ok: false,
        message: "تعذر ربط القاعات بفرع: أسماء القاعات غير صالحة لتعريف السجل المرجعي.",
      };
    }
    if (!seen.has(n.roomNameKey)) {
      seen.add(n.roomNameKey);
      keys.push(n.roomNameKey);
    }
  }
  if (keys.length === 0) {
    return {
      ok: false,
      message:
        "أدخل قاعة واحدة على الأقل ليُستنتج الفرع عند اختيار «لكل الكلية» مع مادة مشتركة على مستوى الكلية.",
    };
  }
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const pool = getDbPool();
  const q = await pool.query<{ college_subject_id: string }>(
    `SELECT college_subject_id::text
     FROM college_room_definitions
     WHERE owner_user_id = $1 AND room_name_key = ANY($2::text[])
     GROUP BY college_subject_id
     HAVING COUNT(DISTINCT room_name_key) = $3::int
     ORDER BY college_subject_id::bigint ASC
     LIMIT 1`,
    [ownerUserId, keys, keys.length]
  );
  const cid = q.rows[0]?.college_subject_id?.trim();
  if (!cid || !/^\d+$/.test(cid)) {
    return {
      ok: false,
      message:
        "المادة مشتركة على مستوى الكلية ولا يوجد قسم/فرع واحد يضم جميع القاعات المختارة في «تعريف القاعات». عرّف القاعات في فرع واحد أو اختر قسمًا محددًا من الحقل أعلاه.",
    };
  }
  return { ok: true, collegeSubjectId: cid };
}

/** فرع من المادة إن وُجد، وإلا من أسماء القاعات (مواد مشتركة college_subject_id = NULL). */
export async function resolveCollegeSubjectIdForAllBranchesExam(
  ownerUserId: string,
  studySubjectId: string,
  roomNames: string[]
): Promise<{ ok: true; collegeSubjectId: string } | { ok: false; message: string }> {
  const sid = studySubjectId.trim();
  if (!/^\d+$/.test(sid)) return { ok: false, message: "اختر المادة الدراسية أولاً ليتحدد فرعها." };
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const pool = getDbPool();
  const r = await pool.query<{ college_subject_id: string | number | null }>(
    `SELECT college_subject_id FROM college_study_subjects WHERE id = $1::bigint AND owner_user_id = $2 LIMIT 1`,
    [sid, ownerUserId]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "المادة الدراسية المختارة غير موجودة." };
  const raw = r.rows[0]?.college_subject_id;
  if (raw != null) {
    const cid = String(raw).trim();
    if (!/^\d+$/.test(cid)) return { ok: false, message: "تعذر استنتاج الفرع من المادة المختارة." };
    return { ok: true, collegeSubjectId: cid };
  }
  return inferCollegeSubjectIdFromRoomDefinitionsBulk(ownerUserId, roomNames);
}

/** استنتاج الفرع عند إنشاء/تعديل جدول امتحاني باختيار «كل الفروع» — من أسماء القاعات المختارة. */
export async function resolveCollegeSubjectIdForExamScheduleAllBranches(
  ownerUserId: string,
  studySubjectId: string,
  roomIds: string[]
): Promise<{ ok: true; collegeSubjectId: string } | { ok: false; message: string }> {
  const ids = roomIds.map((x) => x.trim()).filter((x) => /^\d+$/.test(x));
  if (ids.length === 0) {
    return { ok: false, message: "يرجى اختيار قاعة امتحانية واحدة على الأقل." };
  }
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const pool = getDbPool();
  const rooms = await pool.query<{ room_name: string; college_subject_id: string }>(
    `SELECT TRIM(room_name) AS room_name, college_subject_id::text
     FROM college_exam_rooms
     WHERE owner_user_id = $1 AND id = ANY($2::bigint[])`,
    [ownerUserId, ids]
  );
  if ((rooms.rowCount ?? 0) === 0) {
    return { ok: false, message: "القاعات المختارة غير موجودة." };
  }
  const names = rooms.rows.map((r) => r.room_name).filter((n) => n.length > 0);
  const resolved = await resolveCollegeSubjectIdForAllBranchesExam(ownerUserId, studySubjectId, names);
  if (resolved.ok) return resolved;
  const branchIds = new Set(
    rooms.rows.map((r) => r.college_subject_id?.trim()).filter((x): x is string => Boolean(x && /^\d+$/.test(x)))
  );
  if (branchIds.size === 1) {
    return { ok: true, collegeSubjectId: [...branchIds][0]! };
  }
  return resolved;
}
