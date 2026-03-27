/** نافذة رفع الموقف: من بداية الامتحان + 30 دقيقة حتى نهايته (يوم الامتحان بتوقيت بغداد). */
export const EXAM_SITUATION_TZ = "Asia/Baghdad";

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

/** يُسمح برفع الموقف اليوم (بتوقيت بغداد) من (بدء + 30 دقيقة) حتى وقت الانتهاء. */
export function canUploadSituationInExamWindow(
  examDate: string,
  startTime: string,
  endTime: string,
  now: Date = new Date()
): boolean {
  const today = calendarDateInTimeZone(now, EXAM_SITUATION_TZ);
  if (today !== examDate.trim()) return false;
  const nowM = minutesSinceMidnightInTimeZone(now, EXAM_SITUATION_TZ);
  const sm = parseTimeToMinutes(startTime);
  const em = parseTimeToMinutes(endTime);
  if (sm < 0 || em < 0) return false;
  const openFrom = sm + 30;
  return nowM >= openFrom && nowM <= em;
}

export function formatSituationWindowHintAr(startTime: string, endTime: string): string {
  return `يُسمح برفع الموقف من ${startTime} + 30 دقيقة حتى ${endTime} (توقيت بغداد، يوم الامتحان فقط).`;
}
