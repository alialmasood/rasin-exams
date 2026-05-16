const BAGHDAD = "Asia/Baghdad";

const dateOnlyOpts = (dateStyle: "medium" | "full" | "long" | "short"): Intl.DateTimeFormatOptions => ({
  numberingSystem: "latn",
  timeZone: BAGHDAD,
  dateStyle,
});

/** تاريخ امتحان (YYYY-MM-DD) بصيغة عربية وأرقام إنجليزية */
export function formatExamDateAr(isoDate: string, dateStyle: "medium" | "full" = "medium"): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ", dateOnlyOpts(dateStyle)).format(new Date(`${isoDate}T12:00:00`));
  } catch {
    return isoDate;
  }
}

/** تاريخ/وقت عربي بتوقيت بغداد وأرقام إنجليزية (لاتينية) */
export function formatDateTimeBaghdad(
  input: Date | string | number,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleString("ar-IQ", {
      numberingSystem: "latn",
      timeZone: BAGHDAD,
      ...options,
    });
  } catch {
    return d.toISOString();
  }
}
