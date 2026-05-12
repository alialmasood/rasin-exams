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
