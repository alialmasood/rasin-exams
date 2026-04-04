"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { getUniversityExamCalendarDayDetailAction } from "@/app/tracking/exam-calendar/actions";
import type {
  UniversityExamCalendarDayAgg,
  UniversityExamCalendarDayDetailLine,
} from "@/lib/university-exam-calendar";

const WEEKDAYS_AR = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

/** عمود أول = السبت (شائع في العرض العربي). */
function saturdayBasedColumn(jsDaySunday0: number): number {
  return (jsDaySunday0 + 1) % 7;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 12, 0, 0)).getUTCDate();
}

function ymd(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseToday(todayYmd: string): { y: number; m: number } {
  const [y, mo] = todayYmd.split("-").map(Number);
  return { y: y ?? new Date().getUTCFullYear(), m: (mo ?? 1) - 1 };
}

function dayTitleAr(ymd: string): string {
  const [y, mo, da] = ymd.split("-").map(Number);
  if (!y || !mo || !da) return ymd;
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(Date.UTC(y, mo - 1, da, 12, 0, 0)));
  } catch {
    return ymd;
  }
}

export function UniversityExamCalendarClient({
  aggregates,
  todayYmd,
}: {
  aggregates: UniversityExamCalendarDayAgg[];
  todayYmd: string;
}) {
  const map = useMemo(() => {
    const m = new Map<string, UniversityExamCalendarDayAgg>();
    for (const a of aggregates) m.set(a.exam_date, a);
    return m;
  }, [aggregates]);

  const start = parseToday(todayYmd);
  const [cursor, setCursor] = useState(() => start);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailLines, setDetailLines] = useState<UniversityExamCalendarDayDetailLine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailFetchToken = useRef(0);

  const groupedDetail = useMemo(() => {
    const m = new Map<string, UniversityExamCalendarDayDetailLine[]>();
    for (const line of detailLines) {
      const k = line.formationLabel;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(line);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "ar"));
  }, [detailLines]);

  const selectDay = useCallback(async (key: string, hasExam: boolean) => {
    if (!hasExam) {
      return;
    }
    if (selectedDate === key) {
      setSelectedDate(null);
      setDetailLines([]);
      setDetailError(null);
      detailFetchToken.current += 1;
      return;
    }
    const token = ++detailFetchToken.current;
    setSelectedDate(key);
    setDetailLoading(true);
    setDetailError(null);
    setDetailLines([]);
    try {
      const res = await getUniversityExamCalendarDayDetailAction(key);
      if (token !== detailFetchToken.current) return;
      if (!res.ok) {
        setDetailError(res.message);
        return;
      }
      setDetailLines(res.lines);
    } catch {
      if (token === detailFetchToken.current) {
        setDetailError("تعذر تحميل تفاصيل اليوم.");
      }
    } finally {
      if (token === detailFetchToken.current) {
        setDetailLoading(false);
      }
    }
  }, [selectedDate]);

  const monthTitle = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory", {
        month: "long",
        year: "numeric",
      }).format(new Date(Date.UTC(cursor.y, cursor.m, 1, 12, 0, 0)));
    } catch {
      return `${cursor.y}-${cursor.m + 1}`;
    }
  }, [cursor.m, cursor.y]);

  const { leadingBlanks, cells } = useMemo(() => {
    const dim = daysInMonth(cursor.y, cursor.m);
    const firstDow = new Date(Date.UTC(cursor.y, cursor.m, 1, 12, 0, 0)).getUTCDay();
    const lead = saturdayBasedColumn(firstDow);
    const list: { day: number; key: string }[] = [];
    for (let d = 1; d <= dim; d++) {
      list.push({ day: d, key: ymd(cursor.y, cursor.m, d) });
    }
    return { leadingBlanks: lead, cells: list };
  }, [cursor.m, cursor.y]);

  function prevMonth() {
    setCursor((c) => {
      const nm = c.m - 1;
      if (nm < 0) return { y: c.y - 1, m: 11 };
      return { y: c.y, m: nm };
    });
  }

  function nextMonth() {
    setCursor((c) => {
      const nm = c.m + 1;
      if (nm > 11) return { y: c.y + 1, m: 0 };
      return { y: c.y, m: nm };
    });
  }

  function goThisMonth() {
    setCursor(start);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-[#e8f2fc] via-[#f4f8ff] to-white text-[#0f2f57]" dir="rtl">
      <header className="shrink-0 border-b border-[#1a3052]/15 bg-white/90 px-4 py-4 shadow-sm backdrop-blur-sm sm:px-6 sm:py-5">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#1e4976]/80 sm:text-xs">
              جامعة البصرة
            </p>
            <h1 className="mt-1 text-xl font-extrabold text-[#1a3052] sm:text-2xl">التقويم الامتحاني</h1>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-[#475569] sm:text-sm">
              الأيام الملوّنة فيها جلسة امتحانية مسجّلة في جداول التشكيلات (نفس مصدر «الجداول الامتحانية» لكل
              كلية). انقر يوماً ملوّناً لعرض التشكيلات والمواد والمراحل أسفل التقويم. اليوم الحالي حسب بغداد.
            </p>
          </div>
          <Link
            href="/tracking"
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl border-2 border-[#1a3052] bg-[#1e4976] px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-[#163a61] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
          >
            <span aria-hidden>←</span>
            العودة إلى المتابعة المركزية
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded-lg border border-[#cbd5e1] bg-white px-3 py-1.5 text-sm font-bold text-[#1a3052] shadow-sm hover:bg-slate-50"
            >
              الشهر السابق
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="rounded-lg border border-[#cbd5e1] bg-white px-3 py-1.5 text-sm font-bold text-[#1a3052] shadow-sm hover:bg-slate-50"
            >
              الشهر التالي
            </button>
            <button
              type="button"
              onClick={goThisMonth}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-950 shadow-sm hover:bg-amber-100/80"
            >
              الشهر الحالي
            </button>
          </div>
          <h2 className="text-lg font-extrabold text-[#1a3052] sm:text-xl">{monthTitle}</h2>
        </div>

        <div className="flex flex-1 flex-col rounded-2xl border border-[#1a3052]/12 bg-white p-2 shadow-md sm:p-4">
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {WEEKDAYS_AR.map((d) => (
              <div
                key={d}
                className="py-2 text-center text-[10px] font-extrabold text-[#64748B] sm:text-xs"
              >
                {d}
              </div>
            ))}
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <div key={`b-${i}`} className="min-h-[3.5rem] sm:min-h-[4.5rem]" aria-hidden />
            ))}
            {cells.map(({ day, key }) => {
              const agg = map.get(key);
              const isToday = key === todayYmd;
              const hasExam = agg != null && agg.session_count > 0;
              const isSelected = selectedDate === key && hasExam;
              const ringClass = isSelected
                ? "ring-2 ring-indigo-600 ring-offset-1"
                : isToday
                  ? "ring-2 ring-amber-500 ring-offset-1"
                  : "";
              const cellInner = (
                <>
                  <span
                    className={`text-sm font-extrabold tabular-nums sm:text-base ${
                      isToday ? "text-amber-900" : "text-[#0f2f57]"
                    }`}
                  >
                    {day}
                  </span>
                  {hasExam ? (
                    <div className="mt-auto space-y-0.5 text-[9px] font-semibold leading-tight text-sky-950 sm:text-[10px]">
                      <p>{agg.session_count} جلسة</p>
                      <p className="text-sky-800/90">{agg.formation_count} تشكيل</p>
                      <p className="text-[8px] font-bold text-indigo-800 sm:text-[9px]">اضغط للتفاصيل</p>
                    </div>
                  ) : (
                    <span className="mt-auto text-[9px] text-slate-400 sm:text-[10px]">—</span>
                  )}
                </>
              );
              const cellClass = `flex min-h-[3.5rem] flex-col rounded-lg border p-1.5 text-start sm:min-h-[4.5rem] sm:p-2 ${
                hasExam
                  ? "border-sky-400/70 bg-gradient-to-br from-sky-100 to-sky-50 shadow-inner"
                  : "border-slate-200/80 bg-slate-50/40"
              } ${ringClass}`;
              return hasExam ? (
                <button
                  key={key}
                  type="button"
                  onClick={() => void selectDay(key, true)}
                  className={`${cellClass} cursor-pointer transition hover:brightness-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
                >
                  {cellInner}
                </button>
              ) : (
                <div key={key} className={cellClass}>
                  {cellInner}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-200 pt-4 text-xs text-[#475569]">
            <span className="inline-flex items-center gap-2 font-semibold">
              <span className="size-4 rounded bg-gradient-to-br from-sky-100 to-sky-50 ring-1 ring-sky-400/60" />
              يوم فيه امتحانات (قابل للنقر)
            </span>
            <span className="inline-flex items-center gap-2 font-semibold">
              <span className="size-4 rounded bg-slate-50 ring-1 ring-slate-200" />
              بدون جلسات في الجداول
            </span>
            <span className="inline-flex items-center gap-2 font-semibold">
              <span className="size-4 rounded ring-2 ring-amber-500" />
              اليوم (بغداد)
            </span>
          </div>
        </div>

        {selectedDate ? (
          <section
            className="mt-6 rounded-2xl border border-[#1a3052]/12 bg-white p-4 shadow-md sm:p-6"
            aria-live="polite"
          >
            <h3 className="text-base font-extrabold text-[#1a3052] sm:text-lg">
              تفاصيل اليوم — {dayTitleAr(selectedDate)}
            </h3>
            <p className="mt-1 text-xs text-[#64748B]">
              التشكيلات التي فيها جدول في هذا التاريخ، مع اسم المادة والمرحلة الدراسية فقط (بدون أوقات أو
              قاعات).
            </p>
            {detailLoading ? (
              <p className="mt-6 text-sm font-semibold text-[#475569]">جاري تحميل التفاصيل…</p>
            ) : detailError ? (
              <p className="mt-6 text-sm font-semibold text-rose-700">{detailError}</p>
            ) : groupedDetail.length === 0 ? (
              <p className="mt-6 text-sm text-[#64748B]">لا توجد بيانات تفصيلية لهذا اليوم.</p>
            ) : (
              <ul className="mt-5 space-y-5">
                {groupedDetail.map(([formation, lines]) => (
                  <li key={formation} className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4">
                    <p className="text-sm font-extrabold text-[#1e3a8a]">{formation}</p>
                    <ul className="mt-2 space-y-1.5 border-s-2 border-sky-300/60 ps-3">
                      {lines.map((line, idx) => (
                        <li
                          key={`${line.subjectName}-${line.stageLabel}-${idx}`}
                          className="text-sm leading-relaxed text-[#334155]"
                        >
                          <span className="font-bold text-[#0f172a]">{line.subjectName}</span>
                          <span className="mx-1.5 text-slate-400">—</span>
                          <span className="text-[#475569]">{line.stageLabel}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
