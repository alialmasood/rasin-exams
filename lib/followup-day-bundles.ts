import type { ExamDayUploadSummary } from "@/lib/college-exam-situations";
import { normalizeFollowupExamDateKey } from "@/lib/followup-exam-date-key";

export type FollowupDayReportBundle = {
  examDate: string;
  meal1: boolean;
  meal2: boolean;
  both: boolean;
};

/** يبني بطاقات «اكتمال مواقف وجبة» — نفس منطق لوحة متابعة المواقف (خادم أو عميل). */
export function buildFollowupDayReportBundles(
  completedDays: ExamDayUploadSummary[],
  fullDayBothMealsReadyDates: string[]
): FollowupDayReportBundle[] {
  const map = new Map<string, { meal1: boolean; meal2: boolean; both: boolean }>();
  for (const d of completedDays) {
    if (d.total_sessions <= 0 || d.uploaded_sessions < d.total_sessions) continue;
    const key = normalizeFollowupExamDateKey(d.exam_date);
    if (!map.has(key)) {
      map.set(key, { meal1: false, meal2: false, both: false });
    }
    const b = map.get(key)!;
    if (d.meal_slot === 1) b.meal1 = true;
    if (d.meal_slot === 2) b.meal2 = true;
  }
  for (const ed of fullDayBothMealsReadyDates) {
    const key = normalizeFollowupExamDateKey(ed);
    if (!map.has(key)) {
      map.set(key, { meal1: false, meal2: false, both: false });
    }
    map.get(key)!.both = true;
  }
  return [...map.entries()]
    .map(([examDate, flags]) => ({ examDate, ...flags }))
    .sort((a, b) => a.examDate.localeCompare(b.examDate));
}
