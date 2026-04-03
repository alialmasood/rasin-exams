"use client";

import type { FollowupFormationScheduleDayRow } from "@/app/tracking/actions";
import { formatCollegeStudyStageLabel } from "@/lib/college-study-stage-display";
import { formatExamMealSlotLabel } from "@/lib/exam-meal-slot";
import type { CollegeExamScheduleRow } from "@/lib/college-exam-schedules";

const SCHEDULE_TYPE_TABLE_SHORT: Record<CollegeExamScheduleRow["schedule_type"], string> = {
  FINAL: "نهائي",
  SEMESTER: "فصلي",
};

const WORKFLOW_LABEL: Record<CollegeExamScheduleRow["workflow_status"], string> = {
  DRAFT: "مسودة",
  SUBMITTED: "مرفوع للمتابعة",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
};

function formatDuration(minutes: number) {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} ساعة و${m} دقيقة`;
  if (h > 0) return h === 1 ? "ساعة واحدة" : `${h} ساعات`;
  return `${m} دقيقة`;
}

function weekdayAr(dateIso: string) {
  if (!dateIso) return "";
  return new Intl.DateTimeFormat("ar-IQ", { weekday: "long" }).format(new Date(`${dateIso}T12:00:00`));
}

function formatClockTo12hAr(hhmm: string): string {
  const raw = String(hhmm ?? "").trim();
  if (!raw) return "—";
  const m = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return raw;
  const h24 = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h24) || !Number.isFinite(min) || min < 0 || min > 59 || h24 < 0 || h24 > 23) return raw;
  const isPm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(min).padStart(2, "0");
  return `${h12}:${mm}\u00a0${isPm ? "م" : "ص"}`;
}

function timeRangeLabel(start: string, end: string) {
  return `${formatClockTo12hAr(start)} – ${formatClockTo12hAr(end)}`;
}

export function FormationScheduleDayModal({
  open,
  onClose,
  formationLabel,
  examDateIso,
  examDateLongAr,
  rows,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  formationLabel: string;
  examDateIso: string;
  examDateLongAr: string;
  rows: FollowupFormationScheduleDayRow[];
  loading: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="formation-schedule-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#1a3052]/50"
        aria-label="إغلاق"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-[min(96vw,1200px)] flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-2xl">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-gradient-to-l from-[#1a3052] to-[#1e4976] px-3 py-2.5 text-white sm:px-4">
          <div className="min-w-0">
            <h2 id="formation-schedule-modal-title" className="text-sm font-extrabold sm:text-base">
              الجدول الامتحاني للتشكيل — يوم واحد
            </h2>
            <p className="mt-0.5 text-[11px] font-medium text-sky-100/90 sm:text-xs">
              {formationLabel} — <span className="tabular-nums">{examDateLongAr}</span> ({examDateIso})
            </p>
            <p className="mt-1 text-[10px] text-sky-200/80">
              مطابق لعرض «الجداول الامتحانية» في بوابة التشكيل — جميع الجلسات المجدولة لهذا التاريخ فقط.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-amber-400/35 px-3 py-1.5 text-xs font-bold text-amber-50 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70"
          >
            إغلاق
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#f8fafc] p-2 sm:p-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-sm font-semibold text-stone-600">
              جاري جلب الجدول الامتحاني…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm font-medium text-stone-500">لا توجد صفوف جدول لهذا اليوم.</div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-[#E2E8F0] bg-white shadow-sm">
              <table className="min-w-[980px] w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-[#F1F5F9] text-xs font-bold text-[#334155] sm:text-sm">
                  <tr>
                    <th className="px-2 py-2.5 text-center tabular-nums">#</th>
                    <th className="px-2 py-2.5 text-right">الكلية / التشكيل</th>
                    <th className="px-2 py-2.5 text-right">القسم / الفرع</th>
                    <th className="px-2 py-2.5 text-right">نوع الجدول</th>
                    <th className="px-2 py-2.5 text-right">المادة</th>
                    <th className="px-2 py-2.5 text-center">المرحلة</th>
                    <th className="px-2 py-2.5 text-center tabular-nums">التاريخ</th>
                    <th className="px-2 py-2.5 text-center">الوجبة</th>
                    <th className="px-2 py-2.5 text-right">اليوم</th>
                    <th className="px-2 py-2.5 text-center tabular-nums">الوقت</th>
                    <th className="px-2 py-2.5 text-center">المدة</th>
                    <th className="px-2 py-2.5 text-right">القاعة</th>
                    <th className="px-2 py-2.5 text-center">حالة الجدول</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {rows.map((r, idx) => (
                    <tr key={r.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-2 py-2 text-center tabular-nums text-[#334155]">{idx + 1}</td>
                      <td className="px-2 py-2 text-right font-semibold text-[#0F172A]">{formationLabel}</td>
                      <td className="px-2 py-2 text-right text-[#334155]">{r.college_subject_name}</td>
                      <td className="px-2 py-2 text-right text-[#334155]">{SCHEDULE_TYPE_TABLE_SHORT[r.schedule_type]}</td>
                      <td className="px-2 py-2 text-right font-medium text-[#0F172A]">{r.study_subject_name}</td>
                      <td className="px-2 py-2 text-center text-[#334155]">
                        {formatCollegeStudyStageLabel(Number(r.stage_level))}
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums text-[#334155]">{r.exam_date}</td>
                      <td className="px-2 py-2 text-center text-xs font-semibold text-[#475569]">
                        {formatExamMealSlotLabel(r.meal_slot)}
                      </td>
                      <td className="px-2 py-2 text-right text-[#334155]">{weekdayAr(r.exam_date)}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-[#334155]">
                        {timeRangeLabel(r.start_time, r.end_time)}
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums text-[#334155]">
                        {formatDuration(r.duration_minutes)}
                      </td>
                      <td className="px-2 py-2 text-right text-[#334155]">{r.room_name}</td>
                      <td className="px-2 py-2 text-center text-xs font-semibold text-[#334155]">
                        {WORKFLOW_LABEL[r.workflow_status]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
