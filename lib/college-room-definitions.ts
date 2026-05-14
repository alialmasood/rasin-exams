import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";
import {
  normalizeCollegeRoomDefinitionName,
  parseCollegeRoomDefinitionLines,
  type CollegeRoomDefinitionRow,
} from "@/lib/college-room-definitions-shared";

const MAX_ROOM_DEFINITIONS_BULK = 200;

type ListRoomDefinitionDbRow = {
  id: string | number;
  owner_user_id: string | number;
  college_subject_id: string | number;
  college_subject_name: string;
  room_name: string;
  room_name_key: string;
  created_at: Date;
  updated_at: Date;
};

async function syncCollegeRoomDefinitionsFromExamRooms(ownerUserId: string, restrictCollegeSubjectId?: string | null) {
  if (!isDatabaseConfigured()) return;
  await ensureCoreSchema();
  const pool = getDbPool();
  const rid = restrictCollegeSubjectId?.trim();
  const r = await pool.query<{ college_subject_id: string | number; room_name: string }>(
    rid
      ? `SELECT college_subject_id, room_name
         FROM college_exam_rooms
         WHERE owner_user_id = $1 AND college_subject_id = $2::bigint
         ORDER BY created_at ASC, id ASC`
      : `SELECT college_subject_id, room_name
         FROM college_exam_rooms
         WHERE owner_user_id = $1
         ORDER BY created_at ASC, id ASC`,
    rid ? [ownerUserId, rid] : [ownerUserId]
  );
  const planned = new Map<string, { collegeSubjectId: string; roomName: string; roomNameKey: string }>();
  for (const row of r.rows) {
    const normalized = normalizeCollegeRoomDefinitionName(row.room_name);
    if (!normalized) continue;
    const collegeSubjectId = String(row.college_subject_id);
    const compoundKey = `${collegeSubjectId}::${normalized.roomNameKey}`;
    if (planned.has(compoundKey)) continue;
    planned.set(compoundKey, {
      collegeSubjectId,
      roomName: normalized.roomName,
      roomNameKey: normalized.roomNameKey,
    });
  }
  for (const item of planned.values()) {
    await pool.query(
      `INSERT INTO college_room_definitions
         (owner_user_id, college_subject_id, room_name, room_name_key, created_at, updated_at)
       VALUES ($1, $2::bigint, $3, $4, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [ownerUserId, item.collegeSubjectId, item.roomName, item.roomNameKey]
    );
  }
}

export async function listCollegeRoomDefinitionsByOwner(
  ownerUserId: string,
  restrictCollegeSubjectId?: string | null
): Promise<CollegeRoomDefinitionRow[]> {
  if (!isDatabaseConfigured()) return [];
  await syncCollegeRoomDefinitionsFromExamRooms(ownerUserId, restrictCollegeSubjectId);
  const pool = getDbPool();
  const rid = restrictCollegeSubjectId?.trim();
  const r = await pool.query<ListRoomDefinitionDbRow>(
    rid
      ? `SELECT d.id, d.owner_user_id, d.college_subject_id,
                c.branch_name AS college_subject_name,
                d.room_name, d.room_name_key, d.created_at, d.updated_at
         FROM college_room_definitions d
         INNER JOIN college_subjects c
           ON c.id = d.college_subject_id AND c.owner_user_id = d.owner_user_id
         WHERE d.owner_user_id = $1 AND d.college_subject_id = $2::bigint
         ORDER BY d.room_name ASC, d.id ASC`
      : `SELECT d.id, d.owner_user_id, d.college_subject_id,
                c.branch_name AS college_subject_name,
                d.room_name, d.room_name_key, d.created_at, d.updated_at
         FROM college_room_definitions d
         INNER JOIN college_subjects c
           ON c.id = d.college_subject_id AND c.owner_user_id = d.owner_user_id
         WHERE d.owner_user_id = $1
         ORDER BY c.branch_name ASC, d.room_name ASC, d.id ASC`,
    rid ? [ownerUserId, rid] : [ownerUserId]
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    owner_user_id: String(row.owner_user_id),
    college_subject_id: String(row.college_subject_id),
    college_subject_name: row.college_subject_name,
    room_name: row.room_name,
    room_name_key: row.room_name_key,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function createCollegeRoomDefinitions(input: {
  ownerUserId: string;
  collegeSubjectId: string;
  roomNamesBulk: string;
}): Promise<
  | {
      ok: true;
      addedCount: number;
      existingCount: number;
      duplicateInputCount: number;
      ignoredCount: number;
      roomNames: string[];
    }
  | { ok: false; message: string }
> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  const collegeSubjectId = input.collegeSubjectId.trim();
  if (!/^\d+$/.test(collegeSubjectId)) return { ok: false, message: "اختر القسم أو الفرع أولاً." };
  await syncCollegeRoomDefinitionsFromExamRooms(input.ownerUserId, collegeSubjectId);
  const parsed = parseCollegeRoomDefinitionLines(input.roomNamesBulk);
  if (parsed.uniqueRooms.length === 0) {
    return {
      ok: false,
      message: "أدخل اسم قاعة واحد على الأقل في التعريف، على أن يكون كل اسم في سطر مستقل.",
    };
  }
  if (parsed.uniqueRooms.length > MAX_ROOM_DEFINITIONS_BULK) {
    return { ok: false, message: `يمكن تعريف ${MAX_ROOM_DEFINITIONS_BULK} قاعة كحد أقصى في عملية واحدة.` };
  }
  const pool = getDbPool();
  const branchExists = await pool.query(
    `SELECT 1 FROM college_subjects WHERE id = $1::bigint AND owner_user_id = $2 LIMIT 1`,
    [collegeSubjectId, input.ownerUserId]
  );
  if ((branchExists.rowCount ?? 0) === 0) return { ok: false, message: "القسم/الفرع المحدد غير موجود." };

  let addedCount = 0;
  for (const room of parsed.uniqueRooms) {
    const ins = await pool.query(
      `INSERT INTO college_room_definitions
         (owner_user_id, college_subject_id, room_name, room_name_key, created_at, updated_at)
       VALUES ($1, $2::bigint, $3, $4, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [input.ownerUserId, collegeSubjectId, room.roomName, room.roomNameKey]
    );
    addedCount += Number(ins.rowCount ?? 0);
  }

  return {
    ok: true,
    addedCount,
    existingCount: parsed.uniqueRooms.length - addedCount,
    duplicateInputCount: parsed.duplicateCount,
    ignoredCount: parsed.ignoredCount,
    roomNames: parsed.uniqueRooms.map((room) => room.roomName),
  };
}

export async function resolveCollegeRoomDefinitionName(input: {
  ownerUserId: string;
  collegeSubjectId: string;
  roomName: string;
}): Promise<{ ok: true; roomName: string; roomNameKey: string } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  const collegeSubjectId = input.collegeSubjectId.trim();
  if (!/^\d+$/.test(collegeSubjectId)) return { ok: false, message: "اختر القسم أو الفرع أولاً." };
  const normalized = normalizeCollegeRoomDefinitionName(input.roomName);
  if (!normalized) return { ok: false, message: "اسم القاعة يجب أن يكون حرفين على الأقل." };
  await syncCollegeRoomDefinitionsFromExamRooms(input.ownerUserId, collegeSubjectId);
  const pool = getDbPool();
  const r = await pool.query<{ room_name: string }>(
    `SELECT room_name
     FROM college_room_definitions
     WHERE owner_user_id = $1 AND college_subject_id = $2::bigint AND room_name_key = $3
     LIMIT 1`,
    [input.ownerUserId, collegeSubjectId, normalized.roomNameKey]
  );
  if ((r.rowCount ?? 0) === 0) {
    return { ok: false, message: "القاعة غير معرّفة في سجل القاعات. استخدم زر «تعريف القاعات» أولاً." };
  }
  return {
    ok: true,
    roomName: String(r.rows[0]?.room_name ?? normalized.roomName),
    roomNameKey: normalized.roomNameKey,
  };
}

const MAX_ROOM_NAME_CHARS = 200;

export async function updateCollegeRoomDefinition(input: {
  ownerUserId: string;
  definitionId: string;
  newRoomNameRaw: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  const defId = input.definitionId.trim();
  if (!/^\d+$/.test(defId)) return { ok: false, message: "معرّف التعريف غير صالح." };
  const normalized = normalizeCollegeRoomDefinitionName(input.newRoomNameRaw);
  if (!normalized) {
    return { ok: false, message: "اسم القاعة الجديد غير صالح (حرفان على الأقل بعد التوحيد)." };
  }
  if (normalized.roomName.length > MAX_ROOM_NAME_CHARS) {
    return { ok: false, message: `اسم القاعة أطول من الحد المسموح (${MAX_ROOM_NAME_CHARS} حرفًا).` };
  }
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query<{ college_subject_id: string; room_name_key: string }>(
      `SELECT college_subject_id::text AS college_subject_id, room_name_key
       FROM college_room_definitions
       WHERE id = $1::bigint AND owner_user_id = $2
       LIMIT 1
       FOR UPDATE`,
      [defId, input.ownerUserId]
    );
    if ((cur.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { ok: false, message: "سجل التعريف غير موجود أو لا تملك صلاحية تعديله." };
    }
    const collegeSubjectId = String(cur.rows[0]?.college_subject_id ?? "").trim();
    const oldKey = String(cur.rows[0]?.room_name_key ?? "").trim();
    if (!collegeSubjectId || !oldKey) {
      await client.query("ROLLBACK");
      return { ok: false, message: "بيانات التعريف غير صالحة." };
    }
    if (normalized.roomNameKey !== oldKey) {
      const dup = await client.query(
        `SELECT 1 FROM college_room_definitions
         WHERE owner_user_id = $1 AND college_subject_id = $2::bigint
           AND room_name_key = $3 AND id <> $4::bigint
         LIMIT 1`,
        [input.ownerUserId, collegeSubjectId, normalized.roomNameKey, defId]
      );
      if ((dup.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          message: "يوجد تعريف آخر لنفس القاعة (بعد توحيد الصيغة) في هذا القسم/الفرع. اختر اسمًا مختلفًا.",
        };
      }
    }
    await client.query(
      `UPDATE college_room_definitions
       SET room_name = $3, room_name_key = $4, updated_at = NOW()
       WHERE id = $1::bigint AND owner_user_id = $2`,
      [defId, input.ownerUserId, normalized.roomName, normalized.roomNameKey]
    );
    const examRows = await client.query<{ id: string; room_name: string }>(
      `SELECT id::text AS id, room_name
       FROM college_exam_rooms
       WHERE owner_user_id = $1 AND college_subject_id = $2::bigint`,
      [input.ownerUserId, collegeSubjectId]
    );
    for (const er of examRows.rows) {
      const k = normalizeCollegeRoomDefinitionName(er.room_name)?.roomNameKey;
      if (k !== oldKey) continue;
      await client.query(
        `UPDATE college_exam_rooms SET room_name = $2, updated_at = NOW() WHERE id = $1::bigint AND owner_user_id = $3`,
        [er.id.trim(), normalized.roomName, input.ownerUserId]
      );
    }
    await client.query("COMMIT");
    return { ok: true };
  } catch (err: unknown) {
    await client.query("ROLLBACK");
    const code = String((err as { code?: string }).code ?? "");
    if (code === "23505") {
      return {
        ok: false,
        message: "تعارض مع تعريف موجود (مفتاح الاسم الموحّد). جرّب اسمًا مختلفًا.",
      };
    }
    return { ok: false, message: "تعذر حفظ تعديل اسم القاعة." };
  } finally {
    client.release();
  }
}

export async function deleteCollegeRoomDefinition(input: {
  ownerUserId: string;
  definitionId: string;
}): Promise<{ ok: true; removedExamRooms: number } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  const defId = input.definitionId.trim();
  if (!/^\d+$/.test(defId)) return { ok: false, message: "معرّف التعريف غير صالح." };
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query<{ college_subject_id: string; room_name_key: string }>(
      `SELECT college_subject_id::text AS college_subject_id, room_name_key
       FROM college_room_definitions
       WHERE id = $1::bigint AND owner_user_id = $2
       LIMIT 1
       FOR UPDATE`,
      [defId, input.ownerUserId]
    );
    if ((cur.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { ok: false, message: "سجل التعريف غير موجود أو لا تملك صلاحية حذفه." };
    }
    const collegeSubjectId = String(cur.rows[0]?.college_subject_id ?? "").trim();
    const nameKey = String(cur.rows[0]?.room_name_key ?? "").trim();
    if (!collegeSubjectId || !nameKey) {
      await client.query("ROLLBACK");
      return { ok: false, message: "بيانات التعريف غير صالحة." };
    }
    const examRows = await client.query<{ id: string; room_name: string }>(
      `SELECT id::text AS id, room_name
       FROM college_exam_rooms
       WHERE owner_user_id = $1 AND college_subject_id = $2::bigint`,
      [input.ownerUserId, collegeSubjectId]
    );
    const matchingIds: string[] = [];
    for (const er of examRows.rows) {
      const k = normalizeCollegeRoomDefinitionName(er.room_name)?.roomNameKey;
      if (k === nameKey) matchingIds.push(er.id.trim());
    }
    if (matchingIds.length > 0) {
      const inUse = await client.query(
        `SELECT COUNT(*)::int AS c
         FROM college_exam_schedules
         WHERE owner_user_id = $1 AND room_id = ANY($2::bigint[])`,
        [input.ownerUserId, matchingIds]
      );
      const c = Number(inUse.rows[0]?.c ?? 0);
      if (c > 0) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          message:
            "تعذر الحذف: توجد جلسات في الجداول الامتحانية مرتبطة بقاعة امتحانية تحمل هذا الاسم. عدّل الجدول أو احذف تلك الجلسات أولاً ثم أعد المحاولة.",
        };
      }
      await client.query(
        `DELETE FROM college_exam_rooms
         WHERE owner_user_id = $1 AND id = ANY($2::bigint[])`,
        [input.ownerUserId, matchingIds]
      );
    }
    const delDef = await client.query(
      `DELETE FROM college_room_definitions WHERE id = $1::bigint AND owner_user_id = $2`,
      [defId, input.ownerUserId]
    );
    if ((delDef.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { ok: false, message: "تعذر حذف سجل التعريف." };
    }
    await client.query("COMMIT");
    return { ok: true, removedExamRooms: matchingIds.length };
  } catch (err: unknown) {
    await client.query("ROLLBACK");
    const code = String((err as { code?: string }).code ?? "");
    if (code === "23503") {
      return {
        ok: false,
        message: "تعذر الحذف بسبب ارتباطات أخرى بالقاعة. أزل الجداول أو السجلات المرتبطة أولاً.",
      };
    }
    return { ok: false, message: "تعذر حذف تعريف القاعة." };
  } finally {
    client.release();
  }
}
