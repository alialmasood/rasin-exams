/**
 * أقسام كلية الزراعة المعروضة في نموذج «إنشاء حساب قسم/فرع» (إدارة الحسابات).
 * تُطابق أسماء السجلات في لوحة الأقسام والفروع عند التسجيل.
 */
export const AGRICULTURE_COLLEGE_DEPARTMENT_NAMES = [
  "قسم علوم الأغذية",
  "قسم الأسماك والثروة البحرية",
  "قسم البستنة وهندسة الحدائق",
  "قسم علوم التربة والموارد المائية",
  "قسم الإنتاج الحيواني",
  "قسم وقاية النبات",
  "قسم المكائن والآلات الزراعية",
  "قسم المحاصيل الحقلية",
] as const;

/**
 * أقسام كلية العلوم المعروضة في نموذج «إنشاء حساب قسم/فرع» (إدارة الحسابات).
 * تُطابق أسماء السجلات في لوحة الأقسام والفروع عند التسجيل.
 */
export const SCIENCE_COLLEGE_DEPARTMENT_NAMES = [
  "الكيمياء",
  "علوم الحياة",
  "علوم الفيزياء",
  "علوم الرياضيات",
  "علم الارض",
  "علم البيئة",
  "التحليلات المرضية",
] as const;

/** قائمة أقسام ثابتة لكل تشكيل يُعرض فيها حقل القسم/الفرع بقائمة معتمدة. */
export function getFixedCollegeDepartmentNamesForFormation(formationTrimmed: string): readonly string[] | null {
  switch (formationTrimmed) {
    case "كلية الزراعة":
      return AGRICULTURE_COLLEGE_DEPARTMENT_NAMES;
    case "كلية العلوم":
      return SCIENCE_COLLEGE_DEPARTMENT_NAMES;
    default:
      return null;
  }
}

/** قائمة التشكيلات المعتمدة لحسابات الكليات (قيمة فريدة لكل حساب). */
export const COLLEGE_FORMATIONS = [
  "كلية الزراعة",
  "كلية الطب البيطري",
  "كلية الصيدلة",
  "كلية التربية البدنية وعلوم الرياضة",
  "كلية التربية للعلوم الانسانية",
  "كلية التربية للعلوم الصرفة",
  "كلية العلوم",
  "كلية علوم البحار",
  "كلية علوم الحاسوب وتكنولوجيا المعلومات",
  "كلية الهندسة",
  "كلية التربية قرنة",
  "كلية الادارة والاقتصاد القرنة",
  "كلية الطب",
  "كلية طب الاسنان",
  "كلية الادارة والاقتصاد",
  "كلية التمريض",
  "كلية التربية للبنات",
  "كلية طب الزهراء",
  "كلية الفنون الجميلة",
  "كلية الاداب",
  "كلية القانون والسياسة",
] as const;

export type CollegeFormation = (typeof COLLEGE_FORMATIONS)[number];

const formationSet = new Set<string>(COLLEGE_FORMATIONS);

export function isValidFormationName(name: string): name is CollegeFormation {
  return formationSet.has(name.trim());
}
