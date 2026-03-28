"use client";

import Link from "next/link";
import type { UploadStatusTableRow } from "@/lib/college-exam-situations";

const WORKFLOW_LABEL: Record<UploadStatusTableRow["workflow_status"], string> = {
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

export function UploadStatusPanel({
  rows,
  collegeLabel,
}: {
  rows: UploadStatusTableRow[];
  collegeLabel: string;
}) {
  return (
    <section className="space-y-6" dir="rtl">
      <header className="relative overflow-hidden rounded-[22px] border border-[#E8EEF7] bg-white px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
          style={{ background: "linear-gradient(90deg, #1E3A8A 0%, #2563EB 55%, #38BDF8 100%)" }}
          aria-hidden
        />
        <h1 className="text-3xl font-extrabold text-[#0F172A]">رفع الموقف الامتحاني</h1>
        <p className="mt-1.5 text-sm text-[#64748B]">
          جميع المواد الامتحانية المضافة في «الجداول الامتحانية» للتشكيل «{collegeLabel}» — مرتبطة بنفس البيانات
          (القاعات، المواد، الأقسام). اضغط «فتح التفاصيل» لإدخال الحضور والغياب ورفع الموقف خلال نافذة الامتحان (من 30
          دقيقة بعد البداية حتى النهاية، بتوقيت بغداد). تأكيد رفع الموقف يتطلب جدولاً مرفوعاً للمتابعة أو معتمداً.
        </p>
      </header>

      <div className="overflow-x-auto rounded-3xl border border-[#E2E8F0] bg-white shadow-sm">
        <table className="w-full min-w-[920px] border-collapse text-right">
          <thead className="sticky top-0 z-10 border-b border-[#1f3578] bg-[#274092]">
            <tr>
              <th className="px-4 py-3 text-xs font-bold text-white">تاريخ الامتحان</th>
              <th className="px-4 py-3 text-xs font-bold text-white">الوقت / المدة</th>
              <th className="px-4 py-3 text-xs font-bold text-white">القاعة</th>
              <th className="px-4 py-3 text-xs font-bold text-white">المادة</th>
              <th className="px-4 py-3 text-xs font-bold text-white">القسم</th>
              <th className="px-4 py-3 text-xs font-bold text-white">حالة الجدول</th>
              <th className="px-4 py-3 text-xs font-bold text-white">حالة رفع الموقف</th>
              <th className="px-4 py-3 text-xs font-bold text-white">مكتمل</th>
              <th className="px-4 py-3 text-xs font-bold text-white">تفاصيل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-14 text-center text-sm text-[#64748B]">
                  لا توجد مواد امتحانية في الجدول بعد. أضف مواداً من صفحة «الجداول الامتحانية» ثم ستظهر هنا تلقائياً.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.schedule_id} className="transition-colors hover:bg-[#F8FAFC]">
                  <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{r.exam_date}</td>
                  <td className="px-4 py-3 text-xs text-[#334155]">
                    {r.start_time} – {r.end_time}
                    <span className="mt-0.5 block text-[#64748B]">{formatDuration(r.duration_minutes)}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#334155]">{r.room_name}</td>
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
                  <td className="px-4 py-3">
                    {r.is_uploaded ? (
                      <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-800 ring-1 ring-sky-200">
                        مرفوع
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                        غير مرفوع
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.is_complete ? (
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
                        مكتمل
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                        غير مكتمل
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/college/upload-status/${r.schedule_id}`}
                      className="rounded-xl border border-[#1E3A8A] px-3 py-1.5 text-xs font-bold text-[#1E3A8A] transition hover:bg-[#EFF6FF]"
                    >
                      فتح التفاصيل
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
