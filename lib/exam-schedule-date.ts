/** تاريخ تقويمي بصيغة YYYY-MM-DD حسب الوقت المحلي للبيئة (متصفح أو خادم). */
export function todayCalendarDateLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function assertExamDateNotInPast(examDateRaw: string): { ok: true } | { ok: false; message: string } {
  const d = examDateRaw.trim();
  if (!d) return { ok: false, message: "يرجى تحديد تاريخ الامتحان." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, message: "صيغة تاريخ الامتحان غير صالحة." };
  if (d < todayCalendarDateLocal()) return { ok: false, message: "لا يمكن اختيار تاريخ امتحان في الماضي." };
  return { ok: true };
}
