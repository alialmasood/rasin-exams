/**
 * قيم العرض فقط — بدون استيراد `db`/`pg` حتى يُستورد هذا الملف من مكوّنات العميل وملفات HTML للطباعة.
 */

/** تخزين الدراسات العليا بأرقام لا تتقاطع مع المراحل 1–6 (الطب مثلاً) */
export const POSTGRAD_STUDY_STAGE_DIPLOMA = 11;
export const POSTGRAD_STUDY_STAGE_MASTER = 12;
export const POSTGRAD_STUDY_STAGE_DOCTOR = 13;

/** عرض المرحلة في القوائم والتقارير (يشمل دبلوم/ماجستير/دكتوراه المخزّنة كـ 11–13) */
export function formatCollegeStudyStageLabel(level: number): string {
  if (level === POSTGRAD_STUDY_STAGE_DIPLOMA) return "دبلوم";
  if (level === POSTGRAD_STUDY_STAGE_MASTER) return "ماجستير";
  if (level === POSTGRAD_STUDY_STAGE_DOCTOR) return "دكتوراه";
  return `المرحلة ${level}`;
}

export function isPostgraduateStudyStageLevel(level: number): boolean {
  return (
    level >= POSTGRAD_STUDY_STAGE_DIPLOMA &&
    level <= POSTGRAD_STUDY_STAGE_DOCTOR
  );
}

/**
 * تسمية عمود «المستوى الدراسي» في الجداول:
 * - الدراسة الأولية (المراحل الرقمية 1–10)
 * - دراسات عليا — دبلوم | ماجستير | دكتوراه
 */
export function formatCollegeStudyLevelTierLabel(level: number): string {
  if (isPostgraduateStudyStageLevel(level)) {
    return `دراسات عليا — ${formatCollegeStudyStageLabel(level)}`;
  }
  return "الدراسة الأولية";
}
