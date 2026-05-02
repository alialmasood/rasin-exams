/**
 * يوحّد تاريخ الامتحان لمفتاح مقارنة واحد (YYYY-MM-DD)،
 * حتى تتطابق بطاقات «اكتمال الوجبة» مع تواريخ «التقارير المحفوظة».
 */
export function normalizeFollowupExamDateKey(isoLike: string | Date): string {
  if (isoLike instanceof Date && !Number.isNaN(isoLike.getTime())) {
    return isoLike.toISOString().slice(0, 10);
  }
  const s = String(isoLike ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try {
    const d = new Date(s.includes("T") ? s : `${s.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return s.slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return s.slice(0, 10);
  }
}
