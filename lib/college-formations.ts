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
