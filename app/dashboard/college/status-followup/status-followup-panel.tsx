"use client";

import { useCollegePortalBasePath } from "@/components/dashboard/college-portal-base-path";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  ExamDayUploadSummary,
  FormationFollowupAlerts,
  StatusFollowupRow,
} from "@/lib/college-exam-situations";
import type { StudyType } from "@/lib/college-study-subjects";
import { formatExamScheduleStudyLevelTierStageOnly } from "@/lib/college-study-stage-display";
import { formatExamMealSlotLabel } from "@/lib/exam-meal-slot";
import { buildFollowupDayReportBundles } from "@/lib/followup-day-bundles";
import type { FollowupDaySaveHint } from "@/lib/followup-day-save-hint";
import { normalizeFollowupExamDateKey } from "@/lib/followup-exam-date-key";
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

/** مفاتيح منفصلة لكل زر في بطاقة «اكتمال مواقف وجبة» حتى لا يعطّل `useTransition` الموحّد وجبةً أثناء عمل الآخرى. */
function followupDayPrintMealOpId(examDate: string, mealSlot: 1 | 2): string {
  return `followup-day-print-${examDate}-m${mealSlot}`;
}
function followupDayPrintFullOpId(examDate: string): string {
  return `followup-day-print-fullday-${examDate}`;
}
function followupDaySaveOpId(examDate: string): string {
  return `followup-day-save-${examDate}`;
}

export type FollowupSavedReportRowProps = {
  id: string;
  exam_date: string;
  saved_at_iso: string;
  has_meal_1: boolean;
  has_meal_2: boolean;
  has_both_meals: boolean;
};

const DEAN_STATUS_SHORT_AR: Record<string, string> = {
  NONE: "غير معتمد من القسم",
  PENDING: "قيد اعتماد القسم",
  APPROVED: "معتمد من رئيس القسم/الفرع",
  REJECTED: "مرفوض من القسم",
};

function BranchCountChips({
  label,
  pairs,
}: {
  label: string;
  pairs: { branch_name: string; count: number }[];
}) {
  if (pairs.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#64748B]">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {pairs.map((p) => (
          <span
            key={`${label}-${p.branch_name}`}
            className="inline-flex items-center rounded-full border border-[#CBD5E1] bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-[#0F172A]"
          >
            {p.branch_name}
            <span className="mr-1.5 text-[#64748B]">({p.count})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

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
  /** تلميحات زر «حفظ الموقف» لكل يوم (مفتاح التاريخ موحّد YYYY-MM-DD). */
  followupDaySaveHints,
  /**
   * نفس منطق «تعطيل الدمج» المحسوب على الخادم لكل `dayKey` — يُستخدم حتى اكتمال الترطيب
   * ليتطابق `disabled` مع HTML القادم من SSR (يُتجاهل بعد `useEffect` الأول).
   */
  followupInitialMergeBlockedByDayKey,
  /** لحساب التشكيل فقط — جلسات لم يُؤكد رفع موقفها بعد، مجمّعة حسب القسم وحالة اعتماد القسم. */
  formationFollowupAlerts = null,
}: {
  rows: StatusFollowupRow[];
  collegeLabel: string;
  daySummaries: ExamDayUploadSummary[];
  fullDayBothMealsReadyDates: string[];
  savedReports: FollowupSavedReportRowProps[];
  followupDaySaveHints: Record<string, FollowupDaySaveHint>;
  followupInitialMergeBlockedByDayKey: Record<string, boolean>;
  formationFollowupAlerts?: FormationFollowupAlerts | null;
}) {
  const portalBase = useCollegePortalBasePath();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  /** عملية نشطة داخل بطاقات «اكتمال مواقف وجبة» فقط — لا تُربَط بـ isPending العام. */
  const [followupDayPendingOpId, setFollowupDayPendingOpId] = useState<string | null>(null);
  /** بعد الترطيب نعتمد `followupDaySaveHints` المحلّي فقط (مثلاً بعد `router.refresh`). */
  const [followupSaveHintsClientReady, setFollowupSaveHintsClientReady] = useState(false);
  useEffect(() => {
    setFollowupSaveHintsClientReady(true);
  }, []);

  const completedDays = daySummaries.filter(
    (d) => d.total_sessions > 0 && d.uploaded_sessions >= d.total_sessions
  );
  const inProgressDays = daySummaries.filter(
    (d) => d.total_sessions > 0 && d.uploaded_sessions < d.total_sessions
  );

  const dayBundles = useMemo(
    () => buildFollowupDayReportBundles(completedDays, fullDayBothMealsReadyDates),
    [completedDays, fullDayBothMealsReadyDates]
  );

  const defaultHint: FollowupDaySaveHint = { hasArchivedRow: false, allowMergeSave: true };

  function onPrintDailyReport(examDate: string, mealSlot: 1 | 2) {
    const opId = followupDayPrintMealOpId(examDate, mealSlot);
    void (async () => {
      setFollowupDayPendingOpId(opId);
      try {
        const res = await getDailyFinalSituationReportHtmlAction(examDate, mealSlot);
        if (!res.ok) {
          window.alert(res.message);
          return;
        }
        if (!openHtmlPrintWindow(res.html)) {
          window.alert("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع.");
        }
      } finally {
        setFollowupDayPendingOpId(null);
      }
    })();
  }

  function onPrintFullDayBothMealsReport(examDate: string) {
    const opId = followupDayPrintFullOpId(examDate);
    void (async () => {
      setFollowupDayPendingOpId(opId);
      try {
        const res = await getDailyFullDayBothMealsReportHtmlAction(examDate);
        if (!res.ok) {
          window.alert(res.message);
          return;
        }
        if (!openHtmlPrintWindow(res.html)) {
          window.alert("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع.");
        }
      } finally {
        setFollowupDayPendingOpId(null);
      }
    })();
  }

  function onSaveFollowupDay(examDate: string) {
    const opId = followupDaySaveOpId(examDate);
    void (async () => {
      setFollowupDayPendingOpId(opId);
      try {
        const res = await saveFollowupDayReportsAction(examDate);
        if (!res.ok) {
          window.alert(res.message);
          return;
        }
        window.alert(
          res.merged
            ? "تم تحديث الأرشيف لنفس يوم الامتحان لتضمين المواقف المكتملة بعد آخر حفظ."
            : "تم حفظ التقارير المتاحة لهذا اليوم في «التقارير المحفوظة»."
        );
        router.refresh();
      } finally {
        setFollowupDayPendingOpId(null);
      }
    })();
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

  const showFormationAlerts =
    portalBase === "/dashboard/college" &&
    formationFollowupAlerts &&
    formationFollowupAlerts.counts.notHeadSubmittedTotal > 0;

  return (
    <section className="space-y-6" dir="rtl">
      {showFormationAlerts ? (
        <div
          className="space-y-4 rounded-[22px] border border-amber-300/80 bg-gradient-to-b from-amber-50/95 to-white px-5 py-4 shadow-sm"
          role="alert"
        >
          <div>
            <p className="text-sm font-extrabold text-amber-950">تنبيهات عميد التشكيل — مواقف لم يُؤكد رفعها بعد</p>
            <p className="mt-1.5 text-xs leading-relaxed text-amber-900/90">
              لديك{" "}
              <span className="font-bold">{formationFollowupAlerts.counts.notHeadSubmittedTotal}</span> جلسة امتحانية
              من مختلف الأقسام ما زال موقفها بانتظار «تأكيد رفع الموقف» من قبلكم بعد اعتماد القسم (أو بانتظار اعتماد
              القسم أولاً). منها:{" "}
              <span className="font-bold text-emerald-800">
                {formationFollowupAlerts.counts.approvedByDept}
              </span>{" "}
              حالة اعتماد الموقف فيها <span className="font-semibold">معتمدة من رئيس القسم/الفرع</span>، و{" "}
              <span className="font-bold text-rose-800">
                {formationFollowupAlerts.counts.notApprovedByDept}
              </span>{" "}
              <span className="font-semibold">غير معتمدة من القسم بعد</span> (قيد المراجعة أو مرفوضة أو بلا اعتماد).
            </p>
            <p className="mt-2 text-[11px] font-semibold text-amber-950/85">
              جاهزة لتأكيد الرفع (معتمد + بيانات مكتملة):{" "}
              <span className="font-extrabold text-[#1E3A8A]">
                {formationFollowupAlerts.counts.readyForHeadConfirm}
              </span>
              {" — "}
              اعتمدها القسم لكن بيانات الموقف غير مكتملة في النظام:{" "}
              <span className="font-extrabold text-amber-950">
                {formationFollowupAlerts.counts.approvedButIncomplete}
              </span>
            </p>
          </div>

          {formationFollowupAlerts.waitingDeptApproval.length > 0 ? (
            <div className="rounded-xl border border-rose-200/90 bg-rose-50/50 px-4 py-3">
              <p className="text-xs font-extrabold text-rose-950">
                بانتظار اعتماد رئيس القسم أو الفرع — {formationFollowupAlerts.waitingDeptApproval.length} جلسة
              </p>
              <p className="mt-1 text-[11px] text-rose-900/90">
                هذه الجلسات <span className="font-semibold">غير معتمدة من القسم</span> بعد؛ لا يمكن تأكيد رفع الموقف
                من التشكيل قبل اعتماد القسم.
              </p>
              <BranchCountChips
                label="توزيع حسب القسم"
                pairs={formationFollowupAlerts.byBranchWaitingDept}
              />
              <details className="mt-3 rounded-lg border border-rose-100 bg-white/80 px-3 py-2">
                <summary className="cursor-pointer text-[11px] font-bold text-rose-900">
                  عرض التفاصيل والحالة لكل جلسة
                </summary>
                <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-[11px]">
                  {formationFollowupAlerts.waitingDeptApproval.map((it) => (
                    <li
                      key={it.schedule_id}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rose-100/80 pb-1.5 last:border-0"
                    >
                      <span className="font-semibold text-[#0F172A]">
                        {it.subject_name} — {it.branch_name}
                      </span>
                      <span className="text-[#64748B]">
                        {formatExamDateAr(it.exam_date)} · {formatExamMealSlotLabel(it.meal_slot)}
                      </span>
                      <span className="w-full text-[10px] text-rose-800">
                        {DEAN_STATUS_SHORT_AR[it.dean_status] ?? it.dean_status}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ) : null}

          {formationFollowupAlerts.approvedButIncomplete.length > 0 ? (
            <div className="rounded-xl border border-amber-200/90 bg-amber-50/40 px-4 py-3">
              <p className="text-xs font-extrabold text-amber-950">
                معتمدة من القسم لكن بيانات الموقف غير مكتملة —{" "}
                {formationFollowupAlerts.approvedButIncomplete.length} جلسة
              </p>
              <p className="mt-1 text-[11px] text-amber-900/90">
                اعتماد القسم مسجّل، إلا أن النظام يعتبر بيانات الموقف ناقصة؛ يحتاج القسم لاستكمال الحقول قبل أن تظهر
                جاهزة لتأكيد الرفع.
              </p>
              <BranchCountChips
                label="توزيع حسب القسم"
                pairs={formationFollowupAlerts.byBranchApprovedIncomplete}
              />
              <details className="mt-3 rounded-lg border border-amber-100 bg-white/80 px-3 py-2">
                <summary className="cursor-pointer text-[11px] font-bold text-amber-950">
                  عرض الجلسات والانتقال لصفحة الموقف
                </summary>
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-[11px]">
                  {formationFollowupAlerts.approvedButIncomplete.map((it) => (
                    <li key={it.schedule_id}>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => router.push(`${portalBase}/upload-status/${it.schedule_id}`)}
                        className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-right font-semibold text-[#0F172A] transition hover:bg-amber-50 disabled:opacity-50"
                      >
                        {it.subject_name} — {it.branch_name}
                        <span className="mt-0.5 block text-[10px] font-normal text-[#64748B]">
                          {formatExamDateAr(it.exam_date)} · {formatExamMealSlotLabel(it.meal_slot)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ) : null}

          {formationFollowupAlerts.readyForHeadConfirm.length > 0 ? (
            <div className="rounded-xl border border-[#1E3A8A]/35 bg-[#EEF2FF]/60 px-4 py-3">
              <p className="text-xs font-extrabold text-[#1E3A8A]">
                جاهزة لتأكيد رفع الموقف — {formationFollowupAlerts.readyForHeadConfirm.length} جلسة
              </p>
              <p className="mt-1 text-[11px] text-[#1E3A8A]/95">
                اعتماد القسم <span className="font-semibold">معتمد</span> والبيانات <span className="font-semibold">مكتملة</span>؛
                يمكنكم فتح الجلسة وتأكيد رفع الموقف من لوحة التشكيل.
              </p>
              <BranchCountChips
                label="توزيع حسب القسم (يحتاج تأكيدكم)"
                pairs={formationFollowupAlerts.byBranchReadyForConfirm}
              />
              <details className="mt-3 rounded-lg border border-[#C7D2FE] bg-white/90 px-3 py-2" open>
                <summary className="cursor-pointer text-[11px] font-bold text-[#1E3A8A]">
                  فتح الجلسات والانتقال لرفع/تأكيد الموقف
                </summary>
                <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto text-[11px]">
                  {formationFollowupAlerts.readyForHeadConfirm.map((it) => (
                    <li key={it.schedule_id}>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => router.push(`${portalBase}/upload-status/${it.schedule_id}`)}
                        className="w-full rounded-lg border-2 border-[#1E3A8A] bg-[#1E3A8A] px-2 py-1.5 text-right font-bold text-white transition hover:bg-[#163170] disabled:opacity-50"
                      >
                        {it.subject_name} — القسم: {it.branch_name}
                        <span className="mt-0.5 block text-[10px] font-normal text-white/90">
                          {formatExamDateAr(it.exam_date)} · {formatExamMealSlotLabel(it.meal_slot)} ·{" "}
                          {DEAN_STATUS_SHORT_AR[it.dean_status]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ) : null}
        </div>
      ) : null}

      {dayBundles.length > 0 ? (
        <div
          className="space-y-3 rounded-[22px] border border-emerald-200/90 bg-gradient-to-b from-emerald-50/95 to-white px-5 py-4 shadow-sm"
          role="status"
        >
          <p className="text-sm font-extrabold text-emerald-900">اكتمال مواقف وجبة امتحانية</p>
          <ul className="flex flex-row flex-nowrap items-stretch gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            {dayBundles.map((bundle) => {
              const dayKey = normalizeFollowupExamDateKey(bundle.examDate);
              const hint = followupDaySaveHints[dayKey] ?? defaultHint;
              const saveBusy = followupDayPendingOpId === followupDaySaveOpId(bundle.examDate);
              const mergeBlocked = followupSaveHintsClientReady
                ? !hint.allowMergeSave
                : Boolean(followupInitialMergeBlockedByDayKey[dayKey]);
              const saveDisabled = saveBusy || mergeBlocked;
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
                        disabled={followupDayPendingOpId === followupDayPrintMealOpId(bundle.examDate, 1)}
                        onClick={() => onPrintDailyReport(bundle.examDate, 1)}
                        className="w-full rounded-lg border-2 border-[#1E3A8A] bg-[#1E3A8A] px-2 py-1.5 text-[11px] font-bold leading-tight text-white transition hover:bg-[#163170] disabled:opacity-50 sm:text-xs"
                      >
                        تقرير نهائي — {formatExamMealSlotLabel(1)} — طباعة / PDF
                      </button>
                    ) : null}
                    {bundle.meal2 ? (
                      <button
                        type="button"
                        disabled={followupDayPendingOpId === followupDayPrintMealOpId(bundle.examDate, 2)}
                        onClick={() => onPrintDailyReport(bundle.examDate, 2)}
                        className="w-full rounded-lg border-2 border-[#1E3A8A] bg-[#1E3A8A] px-2 py-1.5 text-[11px] font-bold leading-tight text-white transition hover:bg-[#163170] disabled:opacity-50 sm:text-xs"
                      >
                        تقرير نهائي — {formatExamMealSlotLabel(2)} — طباعة / PDF
                      </button>
                    ) : null}
                    {bundle.both ? (
                      <button
                        type="button"
                        disabled={followupDayPendingOpId === followupDayPrintFullOpId(bundle.examDate)}
                        onClick={() => onPrintFullDayBothMealsReport(bundle.examDate)}
                        className="w-full rounded-lg border-2 border-emerald-800 bg-emerald-900 px-2 py-1.5 text-[11px] font-bold leading-tight text-white transition hover:bg-emerald-950 disabled:opacity-50 sm:text-xs"
                      >
                        تقرير شامل — الوجبتان — طباعة / PDF
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={!!saveDisabled}
                      title={
                        mergeBlocked
                          ? hint.hasArchivedRow
                            ? "الأرشيف محدّث — لا توجد مواقف جديدة مؤكدة الرفع لهذا اليوم بعد آخر حفظ."
                            : undefined
                          : hint.hasArchivedRow
                            ? "دمج المواقف المكتملة لاحقاً في نفس سجل الأرشيف لهذا اليوم"
                            : undefined
                      }
                      onClick={() => onSaveFollowupDay(bundle.examDate)}
                      className={
                        saveDisabled
                          ? "w-full rounded-lg border-2 border-slate-400 bg-slate-600 px-2 py-1.5 text-[11px] font-bold leading-tight text-white/90 transition disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs"
                          : "w-full rounded-lg border-2 border-emerald-700 bg-emerald-800 px-2 py-1.5 text-[11px] font-bold leading-tight text-white shadow-sm transition hover:bg-emerald-900 hover:shadow sm:text-xs"
                      }
                    >
                      {hint.hasArchivedRow && !mergeBlocked ? "تحديث حفظ الموقف" : "حفظ الموقف"}
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
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">مصادقة العميد</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center text-sm text-[#64748B]">
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
                        {r.kind === "schedule" ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">
                            تمت المصادقة من حساب العميد
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
                            غير مرتبط بمصادقة العميد
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 sm:px-4">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              router.push(
                                r.kind === "schedule"
                                  ? `${portalBase}/upload-status/${r.schedule_id}`
                                  : `${portalBase}/exam-situation-form/${r.form_submission_id}`
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
