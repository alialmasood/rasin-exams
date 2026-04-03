"use client";

import type { FollowupExamSituationBundleJson } from "@/app/tracking/actions";
import { buildExamSituationBundleReportHtml } from "@/lib/college-exam-situation-report-html";
import type { ExamSituationDetail } from "@/lib/college-exam-situations";
import { formatExamMealSlotLabel } from "@/lib/exam-meal-slot";
import { formatExamClock12hAr } from "@/lib/exam-situation-window";

function deserializeSession(s: FollowupExamSituationBundleJson["sessions"][0]): ExamSituationDetail {
  return {
    ...s,
    head_submitted_at: s.head_submitted_at ? new Date(s.head_submitted_at) : null,
    dean_reviewed_at: s.dean_reviewed_at ? new Date(s.dean_reviewed_at) : null,
  };
}

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

export function FollowupSituationBundleModal({
  open,
  onClose,
  bundle,
  collegeLabel,
  deanName,
}: {
  open: boolean;
  onClose: () => void;
  bundle: FollowupExamSituationBundleJson | null;
  collegeLabel: string;
  deanName: string;
}) {
  if (!open || !bundle) return null;

  const sessions = bundle.sessions.map(deserializeSession);
  const head = sessions[0];
  const agg = bundle.aggregates;

  function onPrint() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const html = buildExamSituationBundleReportHtml(sessions, collegeLabel, deanName, new Date(), origin);
    if (!openHtmlPrintWindow(html)) {
      window.alert("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="followup-bundle-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#1a3052]/50"
        aria-label="إغلاق"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(92dvh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-gradient-to-l from-[#1a3052] to-[#1e4976] px-4 py-3 text-white">
          <h2 id="followup-bundle-modal-title" className="text-sm font-bold sm:text-base">
            تقرير الموقف الامتحاني — {collegeLabel}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-white/25 px-2 py-1 text-xs font-semibold hover:bg-white/10"
          >
            إغلاق
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#faf9f6] p-4 text-sm text-stone-800">
          {head ? (
            <div className="mb-4 rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
              <p className="text-[11px] font-bold text-[#1a3052]">بيانات الجلسة المجمّعة</p>
              <p className="mt-2 text-xs text-stone-700">
                <span className="font-semibold">التاريخ:</span> {head.exam_date} —{" "}
                <span className="font-semibold">الوجبة:</span> {formatExamMealSlotLabel(head.meal_slot)}
              </p>
              <p className="mt-1 text-xs text-stone-700">
                <span className="font-semibold">الوقت:</span> {formatExamClock12hAr(head.start_time)} –{" "}
                {formatExamClock12hAr(head.end_time)}
              </p>
              <p className="mt-1 text-xs text-stone-700">
                <span className="font-semibold">المادة:</span> {head.subject_name}
              </p>
              <p className="mt-2 text-xs text-stone-600">
                إجمالي السعة: {agg.capacity_total} — الحضور: {agg.attendance_count} — الغياب: {agg.absence_count}
                {agg.capacity_morning > 0 || agg.capacity_evening > 0 ? (
                  <>
                    {" "}
                    (صباحي: حضور {agg.attendance_morning}، غياب {agg.absence_morning} — مسائي: حضور{" "}
                    {agg.attendance_evening}، غياب {agg.absence_evening})
                  </>
                ) : null}
              </p>
            </div>
          ) : null}

          <p className="mb-2 text-[11px] font-bold text-[#1a3052]">القاعات ({sessions.length})</p>
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li
                key={s.schedule_id}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-sm"
              >
                <span className="font-semibold text-stone-900">{s.room_name}</span>
                <span className="mx-1.5 text-stone-400">—</span>
                <span className="text-stone-700">
                  حضور {s.attendance_count}، غياب {s.absence_count}، سعة {s.capacity_total}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-stone-200 bg-white px-4 py-3">
          <button
            type="button"
            onClick={onPrint}
            className="rounded-lg border-2 border-[#1a3052] bg-[#1e4976] px-4 py-2 text-xs font-bold text-white hover:bg-[#1a3052]"
          >
            طباعة / PDF — نفس تقرير صفحة رفع الموقف
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
