/** ثوابت «لكل الكلية» — بدون اعتماد على قاعدة البيانات (آمن للمكوّنات العميل). */

/** قائمة الجداول الامتحانية — «كل الفروع» / لكل الكلية */
export const EXAM_SCHEDULE_ALL_BRANCHES_VALUE = "__ALL_BRANCHES__";

export function isExamScheduleAllBranchesChoice(raw: string): boolean {
  return raw.trim() === EXAM_SCHEDULE_ALL_BRANCHES_VALUE;
}

/** عرض اسم القسم/الفرع في قوائم الجداول والمواقف عند مادة مشتركة (college_subject_id = NULL). */
export const COLLEGE_WIDE_BRANCH_DISPLAY_AR = "لكل الكلية";

export const SQL_COLLEGE_SUBJECT_DISPLAY_NAME = `CASE WHEN s.college_subject_id IS NULL THEN '${COLLEGE_WIDE_BRANCH_DISPLAY_AR}' ELSE c.branch_name END`;
