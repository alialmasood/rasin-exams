"use client";

import Link from "next/link";
import { useCollegePortalBasePath } from "@/components/dashboard/college-portal-base-path";
import type { StudyType } from "@/lib/college-study-subjects";
import type {
  UploadStatusDashboardStats,
  UploadStatusListItem,
  UploadStatusWorkflow,
} from "@/lib/upload-status-display";
import { formatExamScheduleStudyLevelTierStageOnly } from "@/lib/college-study-stage-display";
import { formatExamMealSlotLabel } from "@/lib/exam-meal-slot";
import { formatExamClock12hAr } from "@/lib/exam-situation-window";
import { STUDY_TYPE_LABEL_AR } from "@/lib/study-type-labels-ar";

const WORKFLOW_LABEL: Record<UploadStatusWorkflow, string> = {
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

function TableStudyLevelColumnBody({ stageLevel, studyType }: { stageLevel: number; studyType: StudyType }) {
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

function StatCard({
  title,
  value,
  hint,
  accentClass,
}: {
  title: string;
  value: number;
  hint: string;
  accentClass: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-[#E8EEF7] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${accentClass}`} aria-hidden />
      <p className="text-xs font-bold text-[#64748B]">{title}</p>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-[#0F172A]">{value}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-[#94A3B8]">{hint}</p>
    </div>
  );
}

export function UploadStatusPanel({
  listItems,
  collegeLabel,
  allUploadedPendingNone = false,
  dashboardStats,
  /** بوابة القسم: إخفاء عمود «القسم» لأن الجدول يخص قسماً واحداً */
  hideDepartmentColumn = false,
}: {
  listItems: UploadStatusListItem[];
  collegeLabel: string;
  /** كل الجلسات المجدولة أُكّد رفع موقفها — لا شيء بانتظار العمل هنا */
  allUploadedPendingNone?: boolean;
  dashboardStats: UploadStatusDashboardStats;
  hideDepartmentColumn?: boolean;
}) {
  const portalBase = useCollegePortalBasePath();
  const tableColCount = hideDepartmentColumn ? 10 : 11;

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
          (القاعات، المواد، الأقسام). اضغط «فتح التفاصيل» لإدخال الحضور والغياب ورفع الموقف: تُفتح البوابة بعد 30
          دقيقة من بداية الامتحان وتبقى مفتوحة؛ الرفع «في الموعد» حتى ساعة ونصف من البداية ثم يُعدّ متأخراً (راجع صفحة
          الجلسة). تأكيد رفع الموقف يتطلب جدولاً مرفوعاً للمتابعة أو معتمداً.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="بانتظار الرفع — النافذة لم تفتح بعد"
          value={dashboardStats.pendingWindowNotOpen}
          hint="يوم الامتحان لم يحن، أو اليوم وقبل بداية الامتحان + 30 دقيقة (توقيت بغداد). لا يُعد متأخراً عن الرفع."
          accentClass="bg-sky-400"
        />
        <StatCard
          title="بانتظار الرفع — نافذة مفتوحة أو موعد انقضى"
          value={dashboardStats.pendingWindowOpenOrLate}
          hint="اليوم من (بداية الامتحان + 30 د) فصاعداً أو انقضى يوم الامتحان دون تأكيد رفع بعد."
          accentClass="bg-amber-400"
        />
        <StatCard
          title="أُكِّد رفعها اليوم"
          value={dashboardStats.uploadedTodayLogical}
          hint="عدد المواقف المنطقية (بعد دمج القاعات) التي سجّل فيها تأكيد الرفع اليوم بتوقيت بغداد."
          accentClass="bg-emerald-400"
        />
        <StatCard
          title="إجمالي المواقف المؤكَّد رفعها"
          value={dashboardStats.uploadedTotalLogical}
          hint="كل المواقف التي أُكِّد رفعها لدى التشكيل، بعد دمج الجلسات متعددة القاعات كما في الجدول."
          accentClass="bg-[#1E3A8A]"
        />
      </div>

      <div className="overflow-x-auto rounded-3xl border border-[#E2E8F0] bg-white shadow-sm">
        <table className="w-full min-w-[1120px] border-collapse text-right">
          <thead className="sticky top-0 z-10 border-b border-[#1f3578] bg-[#274092]">
            <tr>
              <th className="px-4 py-3 text-xs font-bold text-white">تاريخ الامتحان</th>
              <th className="px-4 py-3 text-xs font-bold text-white">الوجبة</th>
              <th className="px-4 py-3 text-xs font-bold text-white">الوقت / المدة</th>
              <th className="px-4 py-3 text-xs font-bold text-white">القاعة</th>
              <th className="px-4 py-3 text-xs font-bold text-white">المادة</th>
              <th className="px-4 py-3 text-xs font-bold text-white">المستوى الدراسي</th>
              {hideDepartmentColumn ? null : (
                <th className="px-4 py-3 text-xs font-bold text-white">القسم</th>
              )}
              <th className="px-4 py-3 text-xs font-bold text-white">حالة الجدول</th>
              <th className="px-4 py-3 text-xs font-bold text-white">حالة رفع الموقف</th>
              <th className="px-4 py-3 text-xs font-bold text-white">مكتمل</th>
              <th className="px-4 py-3 text-xs font-bold text-white">تفاصيل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {listItems.length === 0 ? (
              <tr>
                <td colSpan={tableColCount} className="px-4 py-14 text-center text-sm text-[#64748B]">
                  {allUploadedPendingNone ? (
                    <>
                      لا توجد جلسات بانتظار رفع الموقف هنا؛ المواقف التي تم تأكيد رفعها تظهر في صفحة{" "}
                      <Link
                        href={`${portalBase}/status-followup`}
                        className="font-bold text-[#1E3A8A] underline-offset-2 hover:underline"
                      >
                        متابعة المواقف الامتحانية
                      </Link>
                      .
                    </>
                  ) : (
                    <>
                      لا توجد مواد امتحانية في الجدول بعد. أضف مواداً من صفحة «الجداول الامتحانية» ثم ستظهر هنا
                      تلقائياً.
                    </>
                  )}
                </td>
              </tr>
            ) : (
              listItems.map((item) => {
                if (item.kind === "single") {
                  const r = item.row;
                  return (
                    <tr key={r.schedule_id} className="transition-colors hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{r.exam_date}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-[#475569]">{formatExamMealSlotLabel(r.meal_slot)}</td>
                      <td className="px-4 py-3 text-xs text-[#334155]">
                        {formatExamClock12hAr(r.start_time)} – {formatExamClock12hAr(r.end_time)}
                        <span className="mt-0.5 block text-[#64748B]">{formatDuration(r.duration_minutes)}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#334155]">{r.room_name}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#334155]">{r.subject_name}</td>
                      <td className="max-w-[14rem] align-top px-4 py-3">
                        <TableStudyLevelColumnBody stageLevel={r.stage_level} studyType={r.study_type} />
                      </td>
                      {hideDepartmentColumn ? null : (
                        <td className="px-4 py-3 text-sm text-[#334155]">{r.branch_name}</td>
                      )}
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
                          href={`${portalBase}/upload-status/${r.schedule_id}`}
                          className="rounded-xl border border-[#1E3A8A] px-3 py-1.5 text-xs font-bold text-[#1E3A8A] transition hover:bg-[#EFF6FF]"
                        >
                          فتح التفاصيل
                        </Link>
                      </td>
                    </tr>
                  );
                }
                const g = item;
                const allUp = g.uploaded_count === g.room_count;
                const allDone = g.complete_count === g.room_count;
                return (
                  <tr key={g.primary_schedule_id} className="transition-colors hover:bg-[#F0F9FF]">
                    <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{g.exam_date}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#475569]">{formatExamMealSlotLabel(g.meal_slot)}</td>
                    <td className="px-4 py-3 text-xs text-[#334155]">
                      {formatExamClock12hAr(g.start_time)} – {formatExamClock12hAr(g.end_time)}
                      <span className="mt-0.5 block text-[#64748B]">{formatDuration(g.duration_minutes)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#334155]">
                      <span className="font-semibold text-[#1E3A8A]">{g.room_count} قاعات</span>
                      <span className="mt-1 block text-xs leading-snug text-[#64748B]">{g.room_names_label}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#334155]">{g.subject_name}</td>
                    <td className="max-w-[14rem] align-top px-4 py-3">
                      <TableStudyLevelColumnBody stageLevel={g.stage_level} studyType={g.study_type} />
                    </td>
                    {hideDepartmentColumn ? null : (
                      <td className="px-4 py-3 text-sm text-[#334155]">{g.branch_name}</td>
                    )}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${
                          g.workflow_status === "APPROVED"
                            ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                            : g.workflow_status === "SUBMITTED"
                              ? "bg-sky-50 text-sky-800 ring-sky-200"
                              : g.workflow_status === "REJECTED"
                                ? "bg-rose-50 text-rose-800 ring-rose-200"
                                : "bg-slate-100 text-slate-700 ring-slate-200"
                        }`}
                      >
                        {WORKFLOW_LABEL[g.workflow_status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {allUp ? (
                        <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-800 ring-1 ring-sky-200">
                          مرفوع ({g.room_count}/{g.room_count})
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                          {g.uploaded_count}/{g.room_count} مرفوع
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {allDone ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
                          مكتمل ({g.room_count}/{g.room_count})
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                          {g.complete_count}/{g.room_count} مكتمل
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`${portalBase}/upload-status/${g.primary_schedule_id}`}
                        className="rounded-xl border border-[#1E3A8A] px-3 py-1.5 text-xs font-bold text-[#1E3A8A] transition hover:bg-[#EFF6FF]"
                      >
                        فتح التفاصيل
                      </Link>
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
