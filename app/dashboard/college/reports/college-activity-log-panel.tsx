"use client";

import { useMemo, useState } from "react";
import type { CollegeActivityLogRow } from "@/lib/college-activity-log";

function formatWhen(d: Date): string {
  try {
    return new Date(d).toLocaleString("ar-IQ", {
      timeZone: "Asia/Baghdad",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(d);
  }
}

const ACTION_AR: Record<string, string> = {
  create: "إضافة",
  update: "تحديث",
  delete: "حذف",
  submit: "إرسال / رفع",
  approve: "اعتماد",
  save: "حفظ",
  patch: "تحديث بيانات",
  reject: "رفض",
};

const RESOURCE_AR: Record<string, string> = {
  college_subject: "قسم أو فرع",
  study_subject: "مادة دراسية",
  exam_room: "قاعة امتحانية",
  exam_schedule: "جدول امتحاني",
  holiday: "عطلة رسمية",
  situation_report: "موقف امتحاني (جدول)",
  situation_form: "نموذج موقف",
  followup_saved_report: "تقرير متابعة محفوظ",
  room_attendance: "حضور وغياب قاعة",
  exam_schedule_context: "سياق جدول (اعتماد إداري)",
};

function labelAction(a: string): string {
  return ACTION_AR[a] ?? a;
}

function labelResource(r: string): string {
  return RESOURCE_AR[r] ?? r;
}

export function CollegeActivityLogPanel({
  collegeLabel,
  initialEvents,
}: {
  collegeLabel: string;
  initialEvents: CollegeActivityLogRow[];
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialEvents;
    return initialEvents.filter(
      (e) =>
        e.summary.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.resource.toLowerCase().includes(q)
    );
  }, [initialEvents, query]);

  return (
    <section className="space-y-5" dir="rtl">
      <div className="rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-extrabold text-[#0F172A]">سجل الأحداث</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#64748B]">
          يُسجَّل هنا ما يحدث في بوابة التشكيل/الكلية من إضافة أو تعديل أو حذف أو رفع موقف أو اعتماد أو حفظ
          تقارير وغيرها، لأغراض المراجعة والأمان. يُحدَّث السجل عند تنفيذ العمليات من الخادم.
        </p>
        <p className="mt-2 text-xs font-semibold text-[#334155]">
          التشكيل / الكلية: <span className="text-[#0F172A]">{collegeLabel}</span>
        </p>
      </div>

      <div className="rounded-3xl border border-[#E2E8F0] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-[#0F172A]">
            عدد السجلات المعروضة:{" "}
            <span className="tabular-nums text-[#2563EB]">{filtered.length}</span>
            {query.trim() ? (
              <span className="text-xs font-normal text-[#64748B]"> (من أصل {initialEvents.length})</span>
            ) : null}
          </p>
          <label className="block min-w-0 sm:max-w-xs">
            <span className="sr-only">بحث في السجل</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث في الوصف أو نوع الحدث…"
              className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#0F172A] outline-none ring-[#2563EB]/30 placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-2"
            />
          </label>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-8 text-center text-sm font-medium text-[#64748B]">
            {initialEvents.length === 0
              ? "لا توجد أحداث مسجّلة بعد. سيظهر هنا أي إجراء يُنفَّذ من صفحات الكلية بعد تفعيل التسجيل."
              : "لا توجد نتائج تطابق البحث."}
          </p>
        ) : (
          <div className="mt-4 max-h-[min(70vh,32rem)] overflow-auto rounded-xl border border-[#E8EEF4]">
            <table className="w-full min-w-[640px] border-collapse text-right text-sm">
              <thead className="sticky top-0 z-[1] border-b border-[#E2E8F0] bg-[#F1F5F9] text-xs font-extrabold text-[#334155]">
                <tr>
                  <th className="px-3 py-2.5 sm:px-4">الوقت</th>
                  <th className="px-3 py-2.5 sm:px-4">الإجراء</th>
                  <th className="px-3 py-2.5 sm:px-4">الكيان</th>
                  <th className="px-3 py-2.5 sm:px-4">الوصف</th>
                  <th className="w-24 px-3 py-2.5 sm:px-4">تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#F1F5F9] align-top hover:bg-[#F8FAFC]/90"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-[#475569] sm:px-4 sm:text-sm">
                      {formatWhen(row.created_at)}
                    </td>
                    <td className="px-3 py-2 sm:px-4">
                      <span className="inline-block rounded-lg bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-bold text-[#3730A3] sm:text-xs">
                        {labelAction(row.action)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-[#334155] sm:px-4 sm:text-sm">
                      {labelResource(row.resource)}
                    </td>
                    <td className="max-w-md px-3 py-2 text-xs leading-relaxed text-[#0F172A] sm:px-4 sm:text-sm">
                      {row.summary}
                    </td>
                    <td className="px-3 py-2 sm:px-4">
                      {row.details && Object.keys(row.details).length > 0 ? (
                        <details className="text-xs">
                          <summary className="cursor-pointer font-bold text-[#2563EB]">عرض</summary>
                          <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-slate-100 p-2 text-[10px] leading-snug text-[#334155]">
                            {JSON.stringify(row.details, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-[#94A3B8]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
