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
