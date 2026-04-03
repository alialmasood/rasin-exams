/**
 * نافذة رفع الموقف (توقيت بغداد):
 * - تُفتح بعد 30 دقيقة من بداية الجلسة، وتبقى مفتوحة حتى نهاية يوم الامتحان وبعده (لا تُغلق عند انتهاء وقت الجدول).
 * - «في الموعد» حتى موعد وجبة الامتحان؛ بعده يُعدّ الرفع متأخراً دون إغلاق البوابة.
 */
export const EXAM_SITUATION_TZ = "Asia/Baghdad";

/** آخر وقت لاعتبار الرفع «في الموعد» — الوجبة الأولى (10:00 صباحاً). */
export const MEAL_SLOT1_ONTIME_DEADLINE_MINUTES = 10 * 60;
/** الوجبة الثانية (1:00 ظهراً). */
export const MEAL_SLOT2_ONTIME_DEADLINE_MINUTES = 13 * 60;

export function calendarDateInTimeZone(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function minutesSinceMidnightInTimeZone(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

export function parseTimeToMinutes(hhmm: string): number {
  const s = hhmm.trim().slice(0, 5);
  const [h, m] = s.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

/**
 * عرض وقت جدول امتحان (HH:mm بتوقيت 24) بصيغة 12 ساعة عربية مع «صباحاً / مساءً».
 * عند تعذر التحليل يُعاد النص كما ورد.
 */
export function formatExamClock12hAr(hhmm: string): string {
  const raw = hhmm.trim();
  const total = parseTimeToMinutes(raw);
  if (total < 0) return raw;
  const h24 = Math.floor(total / 60);
  const min = total % 60;
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const mm = String(min).padStart(2, "0");
  const suffix = h24 < 12 ? "صباحاً" : "مساءً";
  return `${h12}:${mm} ${suffix}`;
}

/**
 * يُسمح برفع الموقف بعد مضي 30 دقيقة من بداية الامتحان في يوم الامتحان؛
 * وبعد انتهاء يوم الامتحان يبقى الرفع مسموحاً (متأخراً). قبل يوم الامتحان: غير مسموح.
 */
export function canUploadSituationInExamWindow(
  examDate: string,
  startTime: string,
  _endTime: string,
  now: Date = new Date()
): boolean {
  const today = calendarDateInTimeZone(now, EXAM_SITUATION_TZ);
  const ex = examDate.trim();
  if (ex > today) return false;
  if (ex < today) return true;
  const sm = parseTimeToMinutes(startTime);
  if (sm < 0) return false;
  const openFrom = sm + 30;
  const nowM = minutesSinceMidnightInTimeZone(now, EXAM_SITUATION_TZ);
  return nowM >= openFrom;
}

/**
 * الرفع «متأخر عن الموعد المعتمد» للوجبة (10:00 ص / 1:00 م بتوقيت بغداد)، مع بقاء البوابة مفتوحة.
 * يوم امتحان سابق: يُعتبر متأخراً. قبل فتح النافذة (قبل بداية+30): لا يُعرض كمتأخر.
 */
export function isExamSituationUploadLateByMealPolicy(
  examDate: string,
  startTime: string,
  mealSlot: 1 | 2,
  now: Date = new Date()
): boolean {
  const ex = examDate.trim();
  const today = calendarDateInTimeZone(now, EXAM_SITUATION_TZ);
  if (ex > today) return false;
  if (ex < today) return true;
  const sm = parseTimeToMinutes(startTime);
  if (sm < 0) return false;
  const openFrom = sm + 30;
  const deadline =
    mealSlot === 2 ? MEAL_SLOT2_ONTIME_DEADLINE_MINUTES : MEAL_SLOT1_ONTIME_DEADLINE_MINUTES;
  const nowM = minutesSinceMidnightInTimeZone(now, EXAM_SITUATION_TZ);
  if (nowM < openFrom) return false;
  return nowM > deadline || openFrom > deadline;
}

/**
 * للمواقف غير المرفوعة بعد: يوم الامتحان لم يحن، أو هو اليوم لكن قبل (بداية الامتحان + 30 د) بتوقيت بغداد.
 * لا يُعد «متأخراً عن الرفع» في هذا التصنيف.
 */
export function isExamSituationUploadWindowNotYetOpen(
  examDate: string,
  startTime: string,
  _endTime: string,
  now: Date = new Date()
): boolean {
  const today = calendarDateInTimeZone(now, EXAM_SITUATION_TZ);
  const ex = examDate.trim();
  if (ex > today) return true;
  if (ex < today) return false;
  const nowM = minutesSinceMidnightInTimeZone(now, EXAM_SITUATION_TZ);
  const sm = parseTimeToMinutes(startTime);
  if (sm < 0) return true;
  return nowM < sm + 30;
}

/** مكمّل لـ `isExamSituationUploadWindowNotYetOpen`: نافذة الرفع مفتوحة اليوم، أو انقضى يوم الامتحان دون رفع بعد. */
export function isExamSituationUploadOverdueOrWindowOpen(
  examDate: string,
  startTime: string,
  endTime: string,
  now: Date = new Date()
): boolean {
  return !isExamSituationUploadWindowNotYetOpen(examDate, startTime, endTime, now);
}

export function formatSituationWindowHintAr(mealSlot: 1 | 2, startTime: string): string {
  const deadlinePhrase =
    mealSlot === 2
      ? "الواحدة ظهراً (1:00 م)"
      : "العاشرة صباحاً (10:00 ص)";
  return `تُفتح بوابة الرفع بعد 30 دقيقة من بداية الامتحان (${startTime}، توقيت بغداد) وتبقى مفتوحة بعدها دون إغلاق عند انتهاء وقت الجدول. الرفع حتى ${deadlinePhrase} يُعدّ في الموعد؛ بعده يُعدّ متأخراً ويظل الرفع متاحاً.`;
}
