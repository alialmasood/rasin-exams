"use client";

import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import type { ExamDayUploadSummary, StatusFollowupRow } from "@/lib/college-exam-situations";
import type { StudyType } from "@/lib/college-study-subjects";
import { formatExamScheduleStudyLevelTierStageOnly } from "@/lib/college-study-stage-display";
import { formatExamMealSlotLabel } from "@/lib/exam-meal-slot";
import { STUDY_TYPE_LABEL_AR } from "@/lib/study-type-labels-ar";
import {
  deleteSavedFollowupDayReportAction,
  deleteSituationFormSubmissionAction,
  deleteUploadedExamSituationAction,
  getDailyFinalSituationReportHtmlAction,
  getDailyFullDayBothMealsReportHtmlAction,
  getSavedFollowupDayReportHtmlAction,
  saveFollowupDayReportsAction,
} from "./actions";

/** نوع جزء التقرير المحفوظ — محليًا لتجنّب استيراد أنواع من ملف الإجراءات (قد يسبب أخطاء وقت التشغيل مع Turbopack). */
type SavedReportPart = "meal1" | "meal2" | "both";

function openHtmlPrintWindow(html: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  try {
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    const runPrint = () => {
      try {
        w.print();
      } catch {
        window.alert("تعذر بدء الطباعة. جرّب متصفحاً آخر أو أعد المحاولة.");
      }
    };
    if (w.document.readyState === "complete") {
      window.setTimeout(runPrint, 120);
    } else {
      w.addEventListener("load", () => window.setTimeout(runPrint, 120), { once: true });
    }
    return true;
  } catch {
    try {
      w.close();
    } catch {
      /* ignore */
    }
    return false;
  }
}

function formatExamDateAr(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ", {
      dateStyle: "full",
      timeZone: "Asia/Baghdad",
    }).format(new Date(`${isoDate}T12:00:00`));
  } catch {
    return isoDate;
  }
}

function formatSavedAtLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ", {
      timeZone: "Asia/Baghdad",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function openHtmlPreviewWindow(html: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  try {
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    return true;
  } catch {
    try {
      w.close();
    } catch {
      /* ignore */
    }
    return false;
  }
}

type DayReportBundle = {
  examDate: string;
  meal1: boolean;
  meal2: boolean;
  both: boolean;
};

function buildDayReportBundles(
  completedDays: ExamDayUploadSummary[],
  fullDayBothMealsReadyDates: string[]
): DayReportBundle[] {
  const map = new Map<string, { meal1: boolean; meal2: boolean; both: boolean }>();
  for (const d of completedDays) {
    if (d.total_sessions <= 0 || d.uploaded_sessions < d.total_sessions) continue;
    if (!map.has(d.exam_date)) {
      map.set(d.exam_date, { meal1: false, meal2: false, both: false });
    }
    const b = map.get(d.exam_date)!;
    if (d.meal_slot === 1) b.meal1 = true;
    if (d.meal_slot === 2) b.meal2 = true;
  }
  for (const ed of fullDayBothMealsReadyDates) {
    if (!map.has(ed)) {
      map.set(ed, { meal1: false, meal2: false, both: false });
    }
    map.get(ed)!.both = true;
  }
  return [...map.entries()]
    .map(([examDate, flags]) => ({ examDate, ...flags }))
    .sort((a, b) => a.examDate.localeCompare(b.examDate));
}

export type FollowupSavedReportRowProps = {
  id: string;
  exam_date: string;
  saved_at_iso: string;
  has_meal_1: boolean;
  has_meal_2: boolean;
  has_both_meals: boolean;
};

function FollowupScheduleStudyLevelCell({ stageLevel, studyType }: { stageLevel: number; studyType: StudyType }) {
  return (
    <div className="min-w-[7.5rem] space-y-2 text-right">
      <div>
        <p className="text-[9px] font-bold text-[#64748B]">المستوى الدراسي</p>
        <p className="mt-1 text-[11px] font-semibold leading-snug text-[#0F172A]">
          {formatExamScheduleStudyLevelTierStageOnly(stageLevel)}
        </p>
      </div>
      <div className="border-t border-[#E2E8F0] pt-2">
        <p className="text-[9px] font-bold text-[#64748B]">نوع الدراسة</p>
        <p className="mt-1 text-[11px] font-semibold text-[#334155]">{STUDY_TYPE_LABEL_AR[studyType]}</p>
      </div>
    </div>
  );
}

export function StatusFollowupPanel({
  rows,
  collegeLabel,
  daySummaries,
  /** يُحسب على الخادم — لا تستورد `college-exam-situations` في العميل (يربط حزمة `pg`). */
  fullDayBothMealsReadyDates,
  savedReports,
  examDatesAlreadySaved,
}: {
  rows: StatusFollowupRow[];
  collegeLabel: string;
  daySummaries: ExamDayUploadSummary[];
  fullDayBothMealsReadyDates: string[];
  savedReports: FollowupSavedReportRowProps[];
  /** تواريخ امتحان سبق حفظ موقفها (منع التكرار في الواجهة). */
  examDatesAlreadySaved: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const completedDays = daySummaries.filter(
    (d) => d.total_sessions > 0 && d.uploaded_sessions >= d.total_sessions
  );
  const inProgressDays = daySummaries.filter(
    (d) => d.total_sessions > 0 && d.uploaded_sessions < d.total_sessions
  );

  const dayBundles = useMemo(
    () => buildDayReportBundles(completedDays, fullDayBothMealsReadyDates),
    [completedDays, fullDayBothMealsReadyDates]
  );

  const savedDatesSet = useMemo(
    () => new Set(examDatesAlreadySaved),
    [examDatesAlreadySaved]
  );

  function onPrintDailyReport(examDate: string, mealSlot: 1 | 2) {
    startTransition(async () => {
      const res = await getDailyFinalSituationReportHtmlAction(examDate, mealSlot);
      if (!res.ok) {
        window.alert(res.message);
        return;
      }
      if (!openHtmlPrintWindow(res.html)) {
        window.alert("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع.");
      }
    });
  }

  function onPrintFullDayBothMealsReport(examDate: string) {
    startTransition(async () => {
      const res = await getDailyFullDayBothMealsReportHtmlAction(examDate);
      if (!res.ok) {
        window.alert(res.message);
        return;
      }
      if (!openHtmlPrintWindow(res.html)) {
        window.alert("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع.");
      }
    });
  }

  function onSaveFollowupDay(examDate: string) {
    startTransition(async () => {
      const res = await saveFollowupDayReportsAction(examDate);
      if (!res.ok) {
        window.alert(res.message);
        return;
      }
      window.alert("تم حفظ التقارير المتاحة لهذا اليوم في «التقارير المحفوظة».");
      router.refresh();
    });
  }

  function onViewSavedReport(reportId: string, part: SavedReportPart, printAfter: boolean) {
    startTransition(async () => {
      const res = await getSavedFollowupDayReportHtmlAction(reportId, part);
      if (!res.ok) {
        window.alert(res.message);
        return;
      }
      if (printAfter) {
        if (!openHtmlPrintWindow(res.html)) {
          window.alert("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع.");
        }
      } else if (!openHtmlPreviewWindow(res.html)) {
        window.alert("تعذر فتح نافذة العرض. اسمح بالنوافذ المنبثقة لهذا الموقع.");
      }
    });
  }

  function onDeleteSavedReport(reportId: string) {
    const ok = window.confirm("حذف هذا السجل المحفوظ من التقارير؟ لا يمكن التراجع.");
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteSavedFollowupDayReportAction(reportId);
      if (!res.ok) {
        window.alert(res.message);
        return;
      }
      router.refresh();
    });
  }

  function onDeleteUploadedSituation(scheduleId: string, subjectLabel: string) {
    const ok = window.confirm(
      `هل تؤكد حذف الموقف المرفوع لهذه الجلسة؟\n${subjectLabel}\n\nسيزال تأكيد الرفع واعتماد العميد المرتبط بهذا السجل من المتابعة.`
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteUploadedExamSituationAction(scheduleId);
      if (!res.ok) {
        window.alert(res.message);
        return;
      }
      router.refresh();
    });
  }

  function onDeleteFormSubmission(submissionId: string, subjectLabel: string) {
    const ok = window.confirm(`هل تؤكد حذف هذا الموقف المرسل من النموذج؟\n${subjectLabel}`);
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteSituationFormSubmissionAction(submissionId);
      if (!res.ok) {
        window.alert(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-6" dir="rtl">
      {dayBundles.length > 0 ? (
        <div
          className="space-y-3 rounded-[22px] border border-emerald-200/90 bg-gradient-to-b from-emerald-50/95 to-white px-5 py-4 shadow-sm"
          role="status"
        >
          <p className="text-sm font-extrabold text-emerald-900">اكتمال مواقف وجبة امتحانية</p>
          <ul className="flex flex-row flex-nowrap items-stretch gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            {dayBundles.map((bundle) => {
              const alreadySaved = savedDatesSet.has(bundle.examDate);
              return (
                <li
                  key={bundle.examDate}
                  className="flex min-w-[11rem] shrink-0 flex-col items-stretch gap-1.5 rounded-xl border border-emerald-200/80 bg-white/90 px-3 py-2"
                >
                  <span className="text-center text-xs font-semibold leading-snug text-[#0F172A] sm:text-sm">
                    {formatExamDateAr(bundle.examDate)}
                  </span>
                  <div className="flex flex-col gap-1">
                    {bundle.meal1 ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => onPrintDailyReport(bundle.examDate, 1)}
                        className="w-full rounded-lg border-2 border-[#1E3A8A] bg-[#1E3A8A] px-2 py-1.5 text-[11px] font-bold leading-tight text-white transition hover:bg-[#163170] disabled:opacity-50 sm:text-xs"
                      >
                        تقرير نهائي — {formatExamMealSlotLabel(1)} — طباعة / PDF
                      </button>
                    ) : null}
                    {bundle.meal2 ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => onPrintDailyReport(bundle.examDate, 2)}
                        className="w-full rounded-lg border-2 border-[#1E3A8A] bg-[#1E3A8A] px-2 py-1.5 text-[11px] font-bold leading-tight text-white transition hover:bg-[#163170] disabled:opacity-50 sm:text-xs"
                      >
                        تقرير نهائي — {formatExamMealSlotLabel(2)} — طباعة / PDF
                      </button>
                    ) : null}
                    {bundle.both ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => onPrintFullDayBothMealsReport(bundle.examDate)}
                        className="w-full rounded-lg border-2 border-emerald-800 bg-emerald-900 px-2 py-1.5 text-[11px] font-bold leading-tight text-white transition hover:bg-emerald-950 disabled:opacity-50 sm:text-xs"
                      >
                        تقرير شامل — الوجبتان — طباعة / PDF
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={isPending || alreadySaved}
                      title={
                        alreadySaved
                          ? "تم حفظ هذا اليوم — احذف من التقارير المحفوظة لإعادة الحفظ"
                          : undefined
                      }
                      onClick={() => onSaveFollowupDay(bundle.examDate)}
                      className="w-full rounded-lg border-2 border-slate-500 bg-slate-700 px-2 py-1.5 text-[11px] font-bold leading-tight text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 sm:text-xs"
                    >
                      حفظ الموقف
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {inProgressDays.length > 0 ? (
        <div
          className="rounded-[22px] border border-amber-200/90 bg-amber-50/60 px-5 py-4 text-sm text-amber-950/95"
          role="status"
        >
          <p className="font-extrabold text-amber-900">متابعة رفع المواقف حسب اليوم والوجبة</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {inProgressDays.map((d) => (
              <li key={`${d.exam_date}-${d.meal_slot}`}>
                <span className="font-semibold">
                  {formatExamDateAr(d.exam_date)} — {formatExamMealSlotLabel(d.meal_slot)}
                </span>
                : مرفوع {d.uploaded_sessions} من {d.total_sessions} جلسة — عند اكتمال هذه الوجبة يظهر زر التقرير
                النهائي لها أعلاه.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <header className="relative overflow-hidden rounded-[22px] border border-[#E8EEF7] bg-white px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
          style={{ background: "linear-gradient(90deg, #1E3A8A 0%, #2563EB 55%, #38BDF8 100%)" }}
          aria-hidden
        />
        <h1 className="text-3xl font-extrabold text-[#0F172A]">متابعة المواقف الامتحانية</h1>
        <p className="mt-1.5 text-sm text-[#64748B]">
          التشكيل «{collegeLabel}» — الجدول يجمع مواقف <strong className="font-semibold text-[#334155]">الجلسات المجدولة</strong> (رفع
          الموقف من صفحة الجلسة) ومواقف <strong className="font-semibold text-[#334155]">نموذج رفع الموقف الامتحاني</strong> بعد الإرسال
          النهائي. <strong className="font-semibold text-[#334155]">عرض</strong> للتفاصيل، <strong className="font-semibold text-[#334155]">حذف</strong>{" "}
          لإزالة السجل المعروض (نموذج أو تأكيد رفع جلسة حسب النوع).
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="saved-followup-reports-heading">
        <h2 id="saved-followup-reports-heading" className="text-xl font-extrabold text-[#0F172A]">
          التقارير المحفوظة
        </h2>
        <p className="text-xs text-[#64748B]">من «حفظ الموقف» — عرض أو طباعة / PDF لكل جزء محفوظ.</p>
        <div className="overflow-x-auto rounded-3xl border border-[#E2E8F0] bg-white shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-right">
            <thead className="sticky top-0 z-10 bg-[#F1F5F9]">
              <tr className="border-b border-[#E2E8F0]">
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">تاريخ الحفظ</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">تاريخ الامتحان</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">ما تضمّنه</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {savedReports.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-[#64748B]">
                    لا توجد تقارير محفوظة بعد. بعد اكتمال الوجبات استخدم «حفظ الموقف» أعلى الصفحة.
                  </td>
                </tr>
              ) : (
                savedReports.map((sr) => (
                  <tr key={sr.id} className="bg-white transition-colors hover:bg-[#F8FAFC]">
                    <td className="px-3 py-3 text-sm text-[#334155] sm:px-4">{formatSavedAtLabel(sr.saved_at_iso)}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-[#0F172A] sm:px-4">
                      {formatExamDateAr(sr.exam_date)}
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      <div className="flex flex-wrap gap-1.5">
                        {sr.has_meal_1 ? (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-900 ring-1 ring-sky-200">
                            الوجبة الأولى
                          </span>
                        ) : null}
                        {sr.has_meal_2 ? (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-900 ring-1 ring-indigo-200">
                            الوجبة الثانية
                          </span>
                        ) : null}
                        {sr.has_both_meals ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900 ring-1 ring-emerald-200">
                            شامل الوجبتين
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {sr.has_meal_1 ? (
                          <>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => onViewSavedReport(sr.id, "meal1", false)}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:text-[11px]"
                            >
                              عرض ١
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => onViewSavedReport(sr.id, "meal1", true)}
                              className="rounded-md border border-[#1E3A8A] bg-[#1E3A8A] px-2 py-1 text-[10px] font-bold text-white hover:bg-[#163170] disabled:opacity-50 sm:text-[11px]"
                            >
                              PDF ١
                            </button>
                          </>
                        ) : null}
                        {sr.has_meal_2 ? (
                          <>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => onViewSavedReport(sr.id, "meal2", false)}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:text-[11px]"
                            >
                              عرض ٢
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => onViewSavedReport(sr.id, "meal2", true)}
                              className="rounded-md border border-[#1E3A8A] bg-[#1E3A8A] px-2 py-1 text-[10px] font-bold text-white hover:bg-[#163170] disabled:opacity-50 sm:text-[11px]"
                            >
                              PDF ٢
                            </button>
                          </>
                        ) : null}
                        {sr.has_both_meals ? (
                          <>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => onViewSavedReport(sr.id, "both", false)}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:text-[11px]"
                            >
                              عرض شامل
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => onViewSavedReport(sr.id, "both", true)}
                              className="rounded-md border border-emerald-800 bg-emerald-900 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-950 disabled:opacity-50 sm:text-[11px]"
                            >
                              PDF شامل
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => onDeleteSavedReport(sr.id)}
                          className="rounded-md border border-rose-300 bg-white px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 sm:text-[11px]"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="uploaded-situations-heading">
        <h2 id="uploaded-situations-heading" className="text-xl font-extrabold text-[#0F172A]">
          المواقف الامتحانية المرفوعة
        </h2>
        <div className="overflow-x-auto rounded-3xl border border-[#E2E8F0] bg-white shadow-sm">
          <table className="w-full min-w-[880px] border-collapse text-right">
            <thead className="sticky top-0 z-10 bg-[#F1F5F9]">
              <tr className="border-b border-[#E2E8F0]">
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">التسلسل</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">القسم</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">المادة الامتحانية</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">المستوى الدراسي</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">التاريخ</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-sm text-[#64748B]">
                    لا توجد مواقف مرفوعة بعد. تظهر هنا بعد إرسال نموذج «رفع الموقف الامتحاني» أو بعد تأكيد رفع موقف جلسة
                    مجدولة من صفحة الجلسة.
                  </td>
                </tr>
              ) : (
                rows.map((r, index) => {
                  const rowKey = r.kind === "schedule" ? `s-${r.schedule_id}` : `f-${r.form_submission_id}`;
                  const label = `${r.subject_name} — ${r.branch_name} — ${r.exam_date}`;
                  return (
                    <tr key={rowKey} className="bg-white transition-colors hover:bg-[#F8FAFC]">
                      <td className="px-3 py-3 text-sm font-bold tabular-nums text-[#64748B] sm:px-4">{index + 1}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-[#334155] sm:px-4">
                        {r.branch_name}
                        {r.kind === "form" ? (
                          <span className="mt-0.5 block text-[10px] font-bold text-sky-700">نموذج</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-sm text-[#0F172A] sm:px-4">{r.subject_name}</td>
                      <td className="max-w-[14rem] align-top px-3 py-3 sm:px-4">
                        {r.kind === "schedule" ? (
                          <FollowupScheduleStudyLevelCell stageLevel={r.stage_level} studyType={r.study_type} />
                        ) : (
                          <div className="min-w-0 text-right">
                            <p className="text-[9px] font-bold text-[#64748B]">من نموذج رفع الموقف</p>
                            <p className="mt-1 text-[11px] font-semibold leading-snug text-[#334155]">
                              {r.stage_display?.trim() || "—"}
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-[#334155] sm:px-4">{formatExamDateAr(r.exam_date)}</td>
                      <td className="px-3 py-3 sm:px-4">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              router.push(
                                r.kind === "schedule"
                                  ? `/dashboard/college/upload-status/${r.schedule_id}`
                                  : `/dashboard/college/exam-situation-form/${r.form_submission_id}`
                              )
                            }
                            className="rounded-lg border border-[#1E3A8A] bg-white px-3 py-1.5 text-xs font-bold text-[#1E3A8A] shadow-sm transition hover:bg-[#EFF6FF] disabled:opacity-50"
                          >
                            عرض
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              r.kind === "schedule"
                                ? onDeleteUploadedSituation(r.schedule_id, label)
                                : onDeleteFormSubmission(r.form_submission_id, label)
                            }
                            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:opacity-50"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
