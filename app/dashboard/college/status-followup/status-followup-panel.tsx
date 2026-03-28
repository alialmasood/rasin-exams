"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { CollegeExamScheduleRow } from "@/lib/college-exam-schedules";
import type {
  DeanSituationStatus,
  ExamDayUploadSummary,
  StatusFollowupTableRow,
} from "@/lib/college-exam-situations";
import { getDailyFinalSituationReportHtmlAction } from "./actions";

const WORKFLOW_LABEL: Record<CollegeExamScheduleRow["workflow_status"], string> = {
  DRAFT: "مسودة",
  SUBMITTED: "مرفوع للمتابعة",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
};

const DEAN_LABEL: Record<DeanSituationStatus, string> = {
  NONE: "لم يُحدد",
  PENDING: "بانتظار اعتماد العميد",
  APPROVED: "معتمد من العميد",
  REJECTED: "مرفوض من العميد",
};

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

function formatDateTimeBaghdad(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Baghdad",
    }).format(new Date(iso));
  } catch {
    return "—";
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
  rows: StatusFollowupTableRow[];
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
          المواد التي تم <strong className="font-semibold text-[#334155]">رفع موقفها الامتحاني</strong> من صفحة «رفع
          الموقف الامتحاني» للتشكيل «{collegeLabel}». اضغط على أي صف لعرض كامل التفاصيل (الحضور، الغياب، الخط الزمني
          لرفع الموقف واعتماد العميد، والمزيد).
        </p>
      </header>

      <div className="overflow-x-auto rounded-3xl border border-[#E2E8F0] bg-white shadow-sm">
        <table className="w-full min-w-[960px] border-collapse text-right">
          <thead className="sticky top-0 z-10 bg-[#F1F5F9]">
            <tr className="border-b border-[#E2E8F0]">
              <th className="px-4 py-3 text-xs font-bold text-[#334155]">تاريخ إجراء الامتحان</th>
              <th className="px-4 py-3 text-xs font-bold text-[#334155]">المادة الامتحانية</th>
              <th className="px-4 py-3 text-xs font-bold text-[#334155]">القسم</th>
              <th className="px-4 py-3 text-xs font-bold text-[#334155]">حالة الجدول</th>
              <th className="px-4 py-3 text-xs font-bold text-[#334155]">تاريخ ووقت رفع الموقف</th>
              <th className="px-4 py-3 text-xs font-bold text-[#334155]">اعتماد العميد</th>
              <th className="px-4 py-3 text-xs font-bold text-[#334155]">تاريخ المراجعة</th>
              <th className="px-4 py-3 text-xs font-bold text-[#334155]">المتابعة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-14 text-center text-sm text-[#64748B]">
                  لا توجد مواقف مرفوعة بعد. بعد تأكيد رفع الموقف لأي مادة من «رفع الموقف الامتحاني» ستظهر هنا تلقائياً.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const deanBadge =
                  r.dean_status === "APPROVED"
                    ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                    : r.dean_status === "REJECTED"
                      ? "bg-rose-50 text-rose-800 ring-rose-200"
                      : r.dean_status === "PENDING"
                        ? "bg-amber-50 text-amber-800 ring-amber-200"
                        : "bg-slate-100 text-slate-600 ring-slate-200";
                return (
                  <tr
                    key={r.schedule_id}
                    role="link"
                    tabIndex={0}
                    aria-label={`تفاصيل ${r.subject_name} بتاريخ ${r.exam_date}`}
                    className="cursor-pointer transition-colors hover:bg-[#F0F9FF] focus-visible:bg-[#EFF6FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2563EB]"
                    onClick={() => router.push(`/dashboard/college/upload-status/${r.schedule_id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/dashboard/college/upload-status/${r.schedule_id}`);
                      }
                    }}
                  >
                    <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{r.exam_date}</td>
                    <td className="px-4 py-3 text-sm text-[#334155]">
                      {r.subject_name}
                      <span className="mt-0.5 block text-xs text-[#64748B]">المرحلة {r.stage_level}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#334155]">{r.branch_name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${
                          r.workflow_status === "APPROVED"
                            ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                            : r.workflow_status === "SUBMITTED"
                              ? "bg-sky-50 text-sky-800 ring-sky-200"
                              : r.workflow_status === "REJECTED"
                                ? "bg-rose-50 text-rose-800 ring-rose-200"
                                : "bg-slate-100 text-slate-700 ring-slate-200"
                        }`}
                      >
                        {WORKFLOW_LABEL[r.workflow_status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#334155]">{formatDateTimeBaghdad(r.head_submitted_at_iso)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${deanBadge}`}>
                        {DEAN_LABEL[r.dean_status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#334155]">
                      {formatDateTimeBaghdad(r.dean_reviewed_at_iso)}
                    </td>
                    <td className="px-4 py-3">
                      {r.is_complete ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
                          مكتمل
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                          قيد المتابعة
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
