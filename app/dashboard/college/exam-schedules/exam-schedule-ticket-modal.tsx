"use client";

import { useEffect } from "react";
import type { CollegeExamScheduleRow } from "@/lib/college-exam-schedules";
import { formatCollegeStudyStageLabel } from "@/lib/college-study-stage-display";
import { formatExamMealSlotLabel } from "@/lib/exam-meal-slot";

type ScheduleType = "FINAL" | "SEMESTER";

const SCHEDULE_TYPE_LABEL: Record<ScheduleType, string> = {
  FINAL: "جدول امتحانات نهائية",
  SEMESTER: "جدول امتحانات فصلية",
};

const WORKFLOW_LABEL = {
  DRAFT: "مسودة",
  SUBMITTED: "معتمد",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
} as const;

function weekdayAr(dateIso: string) {
  if (!dateIso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-IQ", { weekday: "long" }).format(new Date(dateIso));
  } catch {
    return "—";
  }
}

function timeRangeLabel(start: string, end: string) {
  return `${start || "--:--"} ← ${end || "--:--"}`;
}

function formatDuration(minutes: number) {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} ساعة و${m} دقيقة`;
  if (h > 0) return h === 1 ? "ساعة واحدة" : `${h} ساعات`;
  return `${m} دقيقة`;
}

function formatCreatedAt(value: Date | string) {
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("ar-IQ", {
      timeZone: "Asia/Baghdad",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "—";
  }
}

function referenceCode(id: string) {
  const t = id.replace(/[^a-fA-F0-9]/g, "").slice(-10);
  return t.length >= 6 ? t.toUpperCase() : id.slice(0, 12).toUpperCase();
}

/** نص منسّق لواتساب (يدعم *غامق* في التطبيق) */
function buildTicketWhatsAppMessage(row: CollegeExamScheduleRow, collegeLabel: string): string {
  const lines = [
    "*بطاقة امتحانية — جامعة البصرة / نظام رصين*",
    "",
    `الكلية / التشكيل: ${collegeLabel}`,
    `القسم / الفرع: ${row.college_subject_name}`,
    `نوع الجدول: ${SCHEDULE_TYPE_LABEL[row.schedule_type]}`,
    `العام الدراسي: ${row.academic_year?.trim() || "—"}`,
    `الفصل الدراسي: ${row.term_label?.trim() || "—"}`,
    "",
    `*المادة الامتحانية:* ${row.study_subject_name}`,
    `المستوى الدراسي: ${formatCollegeStudyStageLabel(Number(row.stage_level))}`,
    `القاعة: ${row.room_name}`,
    "",
    `يوم الامتحان: ${weekdayAr(row.exam_date)}`,
    `التاريخ: ${row.exam_date}`,
    `رقم الوجبة: ${formatExamMealSlotLabel(row.meal_slot)}`,
    `وقت الامتحان: ${timeRangeLabel(row.start_time, row.end_time)}`,
    `مدة الامتحان: ${formatDuration(row.duration_minutes)}`,
    "",
    `الملاحظات: ${row.notes?.trim() || "—"}`,
    "",
    `حالة المستند: ${WORKFLOW_LABEL[row.workflow_status]}`,
    `مرجع النظام: ${row.id}`,
    `مرجع مختصر: ${referenceCode(row.id)}`,
    `سجّل في النظام: ${formatCreatedAt(row.created_at)}`,
    "",
    "_صادر من نظام رصين — للاطلاع فقط_",
  ];
  return lines.join("\n");
}

function openWhatsAppWithText(text: string) {
  const maxChars = 2600;
  const body = text.length > maxChars ? `${text.slice(0, maxChars)}\n…(نص مُقتطع)` : text;
  const url = `https://wa.me/?text=${encodeURIComponent(body)}`;
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    window.alert("تعذر فتح واتساب. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.");
  }
}

function TicketField({
  label,
  value,
  emphasize,
  className,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <p className="text-[9px] font-bold leading-tight text-[#64748B]">{label}</p>
      <p
        className={`mt-0.5 break-words leading-snug text-[#0F172A] ${emphasize ? "text-sm font-extrabold text-[#274092] sm:text-[0.95rem]" : "text-[11px] font-semibold sm:text-xs"}`}
      >
        {value || "—"}
      </p>
    </div>
  );
}

export function ExamScheduleTicketModal({
  open,
  row,
  collegeLabel,
  onClose,
}: {
  open: boolean;
  row: CollegeExamScheduleRow | null;
  collegeLabel: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !row) return null;

  const wf = row.workflow_status;
  const chipClass =
    wf === "APPROVED" || wf === "SUBMITTED"
      ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
      : wf === "REJECTED"
          ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200"
          : "bg-amber-50 text-amber-900 ring-1 ring-amber-200";

  return (
    <div
      className="fixed inset-0 z-[285] overflow-y-auto overflow-x-hidden bg-[rgba(15,23,42,0.45)] backdrop-blur-[1px]"
      dir="rtl"
      role="presentation"
      onClick={onClose}
    >
      <div className="flex min-h-[100dvh] w-full items-center justify-center px-3 py-8 sm:px-4 sm:py-10">
        <div
          className="w-full max-w-[min(96vw,52rem)] shrink-0 overflow-hidden rounded-3xl border-2 border-[#1f3578] bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exam-ticket-title"
          onClick={(e) => e.stopPropagation()}
        >
        {/* رأس — نفس انحناء أعلى البطاقة */}
        <div className="relative flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-t-3xl bg-[#274092] px-4 py-2.5 text-white sm:px-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-white/25" aria-hidden />
          <div className="min-w-0">
            <h2 id="exam-ticket-title" className="text-sm font-extrabold tracking-tight sm:text-base">
              بطاقة امتحانية رسمية
            </h2>
            <p className="text-[10px] font-semibold text-white/85">جامعة البصرة — نظام رصين</p>
          </div>
          <p className="hidden text-[10px] text-white/70 sm:block">وثيقة معلوماتية — بيانات النظام</p>
        </div>

        {/* تثقيب أفقي */}
        <div className="relative flex h-2.5 shrink-0 items-center justify-center gap-1 bg-[#F1F5F9] px-2" aria-hidden>
          {Array.from({ length: 32 }, (_, i) => (
            <span key={i} className="size-1 shrink-0 rounded-full bg-[#274092]/25" />
          ))}
        </div>

        <div className="w-full overflow-visible p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4 sm:gap-x-4">
              <TicketField label="الكلية / التشكيل" value={collegeLabel} />
              <TicketField label="القسم / الفرع" value={row.college_subject_name} />
              <TicketField label="نوع الجدول" value={SCHEDULE_TYPE_LABEL[row.schedule_type]} />
              <TicketField label="العام الدراسي" value={row.academic_year?.trim() || "—"} />
              <TicketField label="الفصل الدراسي" value={row.term_label?.trim() || "—"} />
              <TicketField
                label="المادة الامتحانية"
                value={row.study_subject_name}
                emphasize
                className="col-span-2 sm:col-span-2"
              />
              <TicketField
                label="المستوى الدراسي"
                value={formatCollegeStudyStageLabel(Number(row.stage_level))}
              />
              <TicketField label="القاعة" value={row.room_name} />
              <TicketField label="يوم الامتحان" value={weekdayAr(row.exam_date)} />
              <TicketField label="التاريخ" value={row.exam_date} />
              <TicketField label="رقم الوجبة" value={formatExamMealSlotLabel(row.meal_slot)} />
              <TicketField label="وقت الامتحان" value={timeRangeLabel(row.start_time, row.end_time)} />
              <TicketField label="مدة الامتحان" value={formatDuration(row.duration_minutes)} />
              <TicketField
                label="الملاحظات"
                value={row.notes?.trim() || "—"}
                className="col-span-2 sm:col-span-4"
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[#E2E8F0] pt-2">
              <span className="text-[9px] font-bold text-[#64748B]">الحالة</span>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${chipClass}`}>
                {WORKFLOW_LABEL[row.workflow_status]}
              </span>
              <span className="text-[9px] text-[#94A3B8]">|</span>
              <p className="min-w-0 max-w-full text-[9px] leading-tight text-[#64748B]" title={row.id}>
                مرجع:{" "}
                <span className="break-all font-mono tabular-nums text-[#334155]">{row.id}</span>
              </p>
              <span className="text-[9px] text-[#94A3B8]">|</span>
              <p className="text-[9px] text-[#94A3B8]">سجّل: {formatCreatedAt(row.created_at)}</p>
            </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 rounded-b-3xl border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => openWhatsAppWithText(buildTicketWhatsAppMessage(row, collegeLabel))}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#1ebe5d] sm:flex-1 sm:text-sm"
          >
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            إرسال عبر واتساب
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-[#CBD5E1] bg-white py-2 text-xs font-bold text-[#334155] shadow-sm transition hover:bg-[#F8FAFC] sm:flex-1 sm:text-sm"
          >
            إغلاق
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
