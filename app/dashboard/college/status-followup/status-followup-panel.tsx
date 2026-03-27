"use client";

import { useRouter } from "next/navigation";
import type { CollegeExamScheduleRow } from "@/lib/college-exam-schedules";
import type { DeanSituationStatus, StatusFollowupTableRow } from "@/lib/college-exam-situations";

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

export function StatusFollowupPanel({
  rows,
  collegeLabel,
}: {
  rows: StatusFollowupTableRow[];
  collegeLabel: string;
}) {
  const router = useRouter();

  return (
    <section className="space-y-6" dir="rtl">
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
