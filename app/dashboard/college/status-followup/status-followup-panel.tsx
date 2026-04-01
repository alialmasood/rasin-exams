"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ExamDayUploadSummary, StatusFollowupRow } from "@/lib/college-exam-situations";
import {
  deleteSituationFormSubmissionAction,
  deleteUploadedExamSituationAction,
  getDailyFinalSituationReportHtmlAction,
} from "./actions";

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

export function StatusFollowupPanel({
  rows,
  collegeLabel,
  daySummaries,
}: {
  rows: StatusFollowupRow[];
  collegeLabel: string;
  daySummaries: ExamDayUploadSummary[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const completedDays = daySummaries.filter(
    (d) => d.total_sessions > 0 && d.uploaded_sessions >= d.total_sessions
  );
  const inProgressDays = daySummaries.filter(
    (d) => d.total_sessions > 0 && d.uploaded_sessions < d.total_sessions
  );

  function onPrintDailyReport(examDate: string) {
    startTransition(async () => {
      const res = await getDailyFinalSituationReportHtmlAction(examDate);
      if (!res.ok) {
        window.alert(res.message);
        return;
      }
      if (!openHtmlPrintWindow(res.html)) {
        window.alert("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع.");
      }
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
      {completedDays.length > 0 ? (
        <div
          className="space-y-3 rounded-[22px] border border-emerald-200/90 bg-gradient-to-b from-emerald-50/95 to-white px-5 py-4 shadow-sm"
          role="status"
        >
          <p className="text-sm font-extrabold text-emerald-900">اكتمال مواقف يوم امتحاني</p>
          <p className="text-sm leading-relaxed text-emerald-950/90">
            للأيام التالية تم رفع موقف <strong>جميع</strong> المواد الامتحانية المجدولة (المرسلة أو المعتمدة في
            الجداول). يمكنك طباعة <strong>التقرير النهائي</strong> لليوم أو حفظه كـ PDF من نافذة الطباعة.
          </p>
          <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {completedDays.map((d) => (
              <li
                key={d.exam_date}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200/80 bg-white/90 px-3 py-2"
              >
                <span className="text-sm font-semibold text-[#0F172A]">{formatExamDateAr(d.exam_date)}</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onPrintDailyReport(d.exam_date)}
                  className="rounded-lg border-2 border-[#1E3A8A] bg-[#1E3A8A] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#163170] disabled:opacity-50"
                >
                  تقرير نهائي لليوم — طباعة / PDF
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {inProgressDays.length > 0 ? (
        <div
          className="rounded-[22px] border border-amber-200/90 bg-amber-50/60 px-5 py-4 text-sm text-amber-950/95"
          role="status"
        >
          <p className="font-extrabold text-amber-900">متابعة رفع المواقف حسب اليوم</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {inProgressDays.map((d) => (
              <li key={d.exam_date}>
                <span className="font-semibold">{formatExamDateAr(d.exam_date)}</span>: مرفوع {d.uploaded_sessions} من{" "}
                {d.total_sessions} جلسة — عند اكتمال العدد يظهر تنبيه التقرير النهائي أعلاه.
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

      <section className="space-y-3" aria-labelledby="uploaded-situations-heading">
        <h2 id="uploaded-situations-heading" className="text-xl font-extrabold text-[#0F172A]">
          المواقف الامتحانية المرفوعة
        </h2>
        <div className="overflow-x-auto rounded-3xl border border-[#E2E8F0] bg-white shadow-sm">
          <table className="w-full min-w-[640px] border-collapse text-right">
            <thead className="sticky top-0 z-10 bg-[#F1F5F9]">
              <tr className="border-b border-[#E2E8F0]">
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">التسلسل</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">القسم</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">المادة الامتحانية</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">التاريخ</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155] sm:px-4">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-14 text-center text-sm text-[#64748B]">
                    لا توجد مواقف مرفوعة بعد. تظهر هنا بعد إرسال نموذج «رفع الموقف الامتحاني» أو بعد تأكيد رفع موقف جلسة
                    مجدولة من صفحة الجلسة.
                  </td>
                </tr>
              ) : (
                rows.map((r, index) => {
                  const rowKey = r.kind === "schedule" ? `s-${r.schedule_id}` : `f-${r.form_submission_id}`;
                  const stageLine =
                    r.kind === "schedule" ? `المرحلة ${r.stage_level}` : `المرحلة ${r.stage_display}`;
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
                      <td className="px-3 py-3 text-sm text-[#0F172A] sm:px-4">
                        {r.subject_name}
                        <span className="mt-0.5 block text-xs text-[#64748B]">{stageLine}</span>
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
