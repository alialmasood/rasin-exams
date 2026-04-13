/** تطابق دفاتر الامتحان: المستخدمة + التالفة = المستلمة (أعداد صحيحة ≥ 0). — بدون اعتماد على pg/الخادم (آمن للاستيراد من مكوّنات العميل). */
export function isSituationExamBookletsBalanced(received: number, used: number, damaged: number): boolean {
  const r = Math.max(0, Math.floor(Number(received) || 0));
  const u = Math.max(0, Math.floor(Number(used) || 0));
  const d = Math.max(0, Math.floor(Number(damaged) || 0));
  return u + d === r;
}
