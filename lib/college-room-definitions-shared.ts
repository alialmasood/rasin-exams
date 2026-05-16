/** قيمة خاصة لخانة "القسم/الفرع" تعني "كل أقسام/فروع الكلية" — تُستعمل في الحسابات المركزية والتشكيل. */
export const COLLEGE_BRANCH_ALL_SENTINEL = "__ALL__";

export type CollegeRoomDefinitionRow = {
  id: string;
  owner_user_id: string;
  college_subject_id: string;
  college_subject_name: string;
  room_name: string;
  room_name_key: string;
  created_at: Date;
  updated_at: Date;
};

export type NormalizedCollegeRoomDefinition = {
  roomName: string;
  roomNameKey: string;
};

function normalizeArabicDigits(raw: string) {
  return raw
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function collapseSpaces(raw: string) {
  return raw.replace(/\s+/gu, " ").trim();
}

function normalizeRoomPrefix(raw: string) {
  let s = raw;
  s = s.replace(/^القاعة(?:\s+|$)/u, "قاعة ");
  s = s.replace(/^ق(?=\s|\d)/u, "قاعة");
  s = s.replace(/^قاعة(?=\S)/u, "قاعة ");
  s = s.replace(/^قاعة\s+رقم(?:\s+|$)/u, "قاعة ");
  s = s.replace(/^قاعة\s+/u, "قاعة ");
  return collapseSpaces(s);
}

export function normalizeCollegeRoomDefinitionName(raw: string): NormalizedCollegeRoomDefinition | null {
  let s = normalizeArabicDigits(String(raw ?? "").trim());
  if (!s) return null;
  s = s.replace(/\u0640/gu, "");
  s = s.replace(/[(){}\[\],،؛;:|/\\_-]+/gu, " ");
  s = collapseSpaces(s);
  s = normalizeRoomPrefix(s);
  if (/^قاعة(?:\s+|$)/u.test(s)) {
    const tail = collapseSpaces(s.replace(/^قاعة(?:\s+|$)/u, "").replace(/^(?:رقم(?:\s+|$))+/u, ""));
    if (!tail) return null;
    s = `قاعة ${tail}`;
  }
  s = collapseSpaces(s);
  if (s.length < 2) return null;
  const roomNameKey = s.toLowerCase().replace(/\s+/gu, "").replace(/[^\p{L}\p{N}]+/gu, "");
  if (roomNameKey.length < 2) return null;
  return { roomName: s, roomNameKey };
}

export function parseCollegeRoomDefinitionLines(raw: string): {
  uniqueRooms: NormalizedCollegeRoomDefinition[];
  duplicateCount: number;
  ignoredCount: number;
} {
  const seen = new Set<string>();
  const uniqueRooms: NormalizedCollegeRoomDefinition[] = [];
  let duplicateCount = 0;
  let ignoredCount = 0;
  for (const line of String(raw ?? "").split(/\r?\n/u)) {
    const normalized = normalizeCollegeRoomDefinitionName(line);
    if (!normalized) {
      if (line.trim()) ignoredCount += 1;
      continue;
    }
    if (seen.has(normalized.roomNameKey)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(normalized.roomNameKey);
    uniqueRooms.push(normalized);
  }
  return { uniqueRooms, duplicateCount, ignoredCount };
}

type RoomFormStudySubjectScope = { id: string; college_subject_id: string | null };

/** قيمة حقل القسم/الفرع في نموذج القاعة — عند مادة مشتركة نعرض «كل الكلية» وليس الفرع المستنتج في قاعدة البيانات. */
export function collegeSubjectFieldValueForRoomForm(input: {
  storedCollegeSubjectId: string;
  studySubjectId?: string;
  studySubjectId2?: string | null;
  subjects: RoomFormStudySubjectScope[];
  lockedBranchId: string | null;
}): string {
  if (input.lockedBranchId) return input.lockedBranchId;
  const examIds = [input.studySubjectId, input.studySubjectId2].filter((x): x is string => Boolean(x?.trim()));
  for (const sid of examIds) {
    const sub = input.subjects.find((s) => s.id === sid);
    if (sub?.college_subject_id == null) return COLLEGE_BRANCH_ALL_SENTINEL;
  }
  return input.storedCollegeSubjectId.trim();
}

export function studySubjectAllowedInRoomBranchScope(
  subjectId: string,
  branchScope: string,
  subjects: RoomFormStudySubjectScope[]
): boolean {
  if (!subjectId.trim()) return true;
  const sub = subjects.find((s) => s.id === subjectId);
  if (!sub) return false;
  if (branchScope === COLLEGE_BRANCH_ALL_SENTINEL) return true;
  if (!branchScope.trim()) return false;
  return sub.college_subject_id == null || sub.college_subject_id === branchScope;
}
