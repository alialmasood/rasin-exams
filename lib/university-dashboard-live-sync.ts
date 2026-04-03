/**
 * مزامنة تبويبات المتصفح: عند تغيير أقسام الكلية من `/dashboard/college/subjects`
 * نُعلم تبويب `/dashboard` (المدير) ليعيد جلب RSC دون إعادة تحميل يدوية.
 * يعمل فقط ضمن نفس الأصل (localhost / نفس النطاق).
 */

const CHANNEL = "examsuob-university-dashboard-v1";

export function notifyUniversityDashboardStale(): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage({ type: "college_subjects_changed" as const });
    ch.close();
  } catch {
    /* يتجاهل بيئات خاصة أو قيود المتصفح */
  }
}

export function subscribeUniversityDashboardStale(onStale: () => void): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => {};
  }
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = () => {
      onStale();
    };
    return () => ch.close();
  } catch {
    return () => {};
  }
}
