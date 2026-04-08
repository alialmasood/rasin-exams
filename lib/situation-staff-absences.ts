/** غياب مشرف القاعة / المراقبين — يُخزَّن في `college_exam_schedules.situation_staff_absences` (JSONB). */

export type InvigilatorAbsenceEntry = {
  absent_name: string;
  absence_reason: string;
  substitute_name: string;
};

export type SituationStaffAbsencesState = {
  supervisor_absent: boolean;
  supervisor_absence_reason: string;
  supervisor_substitute_name: string;
  invigilator_absences: InvigilatorAbsenceEntry[];
};

export const EMPTY_SITUATION_STAFF_ABSENCES: SituationStaffAbsencesState = {
  supervisor_absent: false,
  supervisor_absence_reason: "",
  supervisor_substitute_name: "",
  invigilator_absences: [],
};

export function splitInvigilatorNamesList(raw: string): string[] {
  return raw
    .split(/[,،;|\n\r]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

type JsonStored = {
  supervisor_absent?: boolean;
  supervisor_absence_reason?: string;
  supervisor_substitute_name?: string;
  invigilator_absences?: Array<{
    absent_name?: string;
    absence_reason?: string;
    substitute_name?: string;
  }>;
};

export function parseSituationStaffAbsencesFromDb(value: unknown): SituationStaffAbsencesState {
  if (value == null || typeof value !== "object") {
    return { ...EMPTY_SITUATION_STAFF_ABSENCES, invigilator_absences: [] };
  }
  const j = value as JsonStored;
  const invRaw = Array.isArray(j.invigilator_absences) ? j.invigilator_absences : [];
  const invigilator_absences = invRaw.map((x) => ({
    absent_name: String(x?.absent_name ?? "").trim(),
    absence_reason: String(x?.absence_reason ?? "").trim(),
    substitute_name: String(x?.substitute_name ?? "").trim(),
  }));
  return {
    supervisor_absent: Boolean(j.supervisor_absent),
    supervisor_absence_reason: String(j.supervisor_absence_reason ?? "").trim(),
    supervisor_substitute_name: String(j.supervisor_substitute_name ?? "").trim(),
    invigilator_absences,
  };
}

/** يُعاد `null` لمسح العمود عند عدم وجود بيانات فعلية. */
export function serializeSituationStaffAbsencesForDb(
  s: SituationStaffAbsencesState
): Record<string, unknown> | null {
  const supOk =
    s.supervisor_absent &&
    s.supervisor_absence_reason.trim().length >= 2 &&
    s.supervisor_substitute_name.trim().length >= 2;
  const inv = s.invigilator_absences
    .map((x) => ({
      absent_name: x.absent_name.trim(),
      absence_reason: x.absence_reason.trim(),
      substitute_name: x.substitute_name.trim(),
    }))
    .filter((x) => x.absent_name && x.absence_reason.length >= 2 && x.substitute_name.length >= 2);
  if (!supOk && inv.length === 0) return null;
  return {
    supervisor_absent: supOk,
    supervisor_absence_reason: supOk ? s.supervisor_absence_reason.trim() : "",
    supervisor_substitute_name: supOk ? s.supervisor_substitute_name.trim() : "",
    invigilator_absences: inv,
  };
}

export function validateSituationStaffAbsences(
  s: SituationStaffAbsencesState,
  allowedInvigilators: string[]
): { ok: true } | { ok: false; message: string } {
  const allowedSet = new Set(allowedInvigilators.map((x) => x.trim()).filter(Boolean));
  if (s.supervisor_absent) {
    if (s.supervisor_absence_reason.trim().length < 2) {
      return { ok: false, message: "أدخل سبب غياب مشرف القاعة (حرفان على الأقل)." };
    }
    if (s.supervisor_substitute_name.trim().length < 2) {
      return { ok: false, message: "أدخل اسم المشرف البديل (حرفان على الأقل)." };
    }
  }
  const filled = s.invigilator_absences.filter(
    (x) => x.absent_name.trim() || x.absence_reason.trim() || x.substitute_name.trim()
  );
  const seenAbsent = new Set<string>();
  for (const row of filled) {
    const n = row.absent_name.trim();
    const r = row.absence_reason.trim();
    const sub = row.substitute_name.trim();
    if (!n || !r || !sub) {
      return {
        ok: false,
        message: "أكمل اختيار المراقب الغائب وسبب الغياب والمراقب البديل، أو أزل الصف الفارغ.",
      };
    }
    if (!allowedSet.has(n)) {
      return { ok: false, message: "اختر المراقب الغائب من القائمة المعروضة فقط." };
    }
    if (r.length < 2) {
      return { ok: false, message: "أدخل سبب غياب المراقب (حرفان على الأقل)." };
    }
    if (sub.length < 2) {
      return { ok: false, message: "أدخل اسم المراقب البديل (حرفان على الأقل)." };
    }
    if (seenAbsent.has(n)) {
      return { ok: false, message: "لا يُكرّر نفس اسم المراقب الغائب في أكثر من صف." };
    }
    seenAbsent.add(n);
  }
  return { ok: true };
}
