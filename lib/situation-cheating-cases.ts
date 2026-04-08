/** حالات غش مسجّلة مع الموقف — `college_exam_schedules.situation_cheating_cases` (JSONB). */

export type CheatingCaseEntry = {
  student_name: string;
  notes: string;
};

export type SituationCheatingCasesState = {
  cheating_reported: boolean;
  cases: CheatingCaseEntry[];
};

export const EMPTY_SITUATION_CHEATING_CASES: SituationCheatingCasesState = {
  cheating_reported: false,
  cases: [],
};

const MAX_CASES = 30;

type JsonStored = {
  cheating_reported?: boolean;
  cases?: Array<{ student_name?: string; notes?: string }>;
};

export function parseSituationCheatingCasesFromDb(value: unknown): SituationCheatingCasesState {
  if (value == null || typeof value !== "object") {
    return { ...EMPTY_SITUATION_CHEATING_CASES, cases: [] };
  }
  const j = value as JsonStored;
  const raw = Array.isArray(j.cases) ? j.cases : [];
  const cases = raw.map((x) => ({
    student_name: String(x?.student_name ?? "").trim(),
    notes: String(x?.notes ?? "").trim(),
  }));
  return {
    cheating_reported: Boolean(j.cheating_reported),
    cases,
  };
}

export function serializeSituationCheatingCasesForDb(
  s: SituationCheatingCasesState
): Record<string, unknown> | null {
  if (!s.cheating_reported) return null;
  const cases = s.cases
    .map((c) => ({
      student_name: c.student_name.trim(),
      notes: c.notes.trim(),
    }))
    .filter((c) => c.student_name.length >= 2 && c.notes.length >= 2);
  if (cases.length === 0) return null;
  return { cheating_reported: true, cases };
}

export function validateSituationCheatingCases(
  s: SituationCheatingCasesState
): { ok: true } | { ok: false; message: string } {
  if (!s.cheating_reported) return { ok: true };
  if (s.cases.length > MAX_CASES) {
    return { ok: false, message: `لا يُسمح بأكثر من ${MAX_CASES} حالة غش.` };
  }
  const filled = s.cases.filter(
    (c) => c.student_name.trim() || c.notes.trim()
  );
  for (const c of filled) {
    if (c.student_name.trim().length < 2) {
      return { ok: false, message: "أدخل اسم الطالب (حرفان على الأقل) لكل حالة غش مذكورة." };
    }
    if (c.notes.trim().length < 2) {
      return { ok: false, message: "أدخل ملاحظات لكل حالة غش (حرفان على الأقل)." };
    }
  }
  if (filled.length === 0) {
    return {
      ok: false,
      message: "عند تفعيل «يوجد حالة غش» أضف اسم الطالب والملاحظات لكل حالة، أو ألغِ التفعيل.",
    };
  }
  return { ok: true };
}
