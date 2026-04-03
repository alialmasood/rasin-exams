/** رقم الوجبة الامتحانية (نفس اليوم) — بدون استيراد قاعدة البيانات (آمن للعميل وملفات الطباعة). */

export type ExamMealSlot = 1 | 2;

export function normalizeExamMealSlot(raw: string): ExamMealSlot {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return n === 2 ? 2 : 1;
}

export function formatExamMealSlotLabel(slot: number): string {
  return normalizeExamMealSlot(String(slot)) === 2 ? "الوجبة الثانية" : "الوجبة الأولى";
}
