"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { subscribeUniversityDashboardStale } from "@/lib/university-dashboard-live-sync";
import {
  UPCOMING_EXAMS_DASHBOARD_PREVIEW_LIMIT,
  type DashboardUpcomingExamSessionRow,
  type UniversityWideDashboardStats,
} from "@/lib/university-wide-dashboard-types";

/** أرقام لاتينية (0–9) لعرض الإحصائيات */
function formatStatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

const WEEKDAY_LABELS_SAT_FIRST = ["سبت", "أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة"];

function addDaysIsoDate(iso: string, dayOffset: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d + dayOffset));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatShortNumericDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ", {
      day: "numeric",
      month: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${iso}T12:00:00.000Z`));
  } catch {
    return iso;
  }
}

function workflowStatusLabelAr(status: DashboardUpcomingExamSessionRow["workflowStatus"]): string {
  if (status === "APPROVED") return "معتمد";
  if (status === "REJECTED") return "مرفوض";
  if (status === "SUBMITTED") return "مرفوع للمتابعة";
  return "مسودة";
}

/** تصدير Excel يعكس بيانات لوحة التحكم العامة (البطاقات، الأسبوع، الحضور، الملخص، المعاينة). */
async function exportUniversityDashboardExcel(stats: UniversityWideDashboardStats): Promise<void> {
  const xlsx = await import("xlsx");
  const df = new Intl.DateTimeFormat("ar-IQ", {
    timeZone: "Asia/Baghdad",
    dateStyle: "full",
    timeStyle: "medium",
  });
  const exportedAt = df.format(new Date());
  const wb = xlsx.utils.book_new();

  const metaRows: (string | number)[][] = [
    ["تقرير لوحة التحكم العامة"],
    [],
    ["تاريخ التصدير (بغداد)", exportedAt],
    ["المنصة", "نظام الامتحانات — لوحة المدير"],
    [],
    [
      "ملاحظة",
      `ورقة «قادمة» تحتوي معاينة حتى ${UPCOMING_EXAMS_DASHBOARD_PREVIEW_LIMIT} جلسة؛ راجع عمود الملخص لإجمالي الجلسات المستقبلية لكل التشكيلات.`,
    ],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(metaRows), "معلومات");

  type CardRow = { البند: string; القيمة: string | number; الوصف: string };
  const بطاقات: CardRow[] = [
    {
      البند: "إجمالي الامتحانات (جلسات الجدول — التشكيل فقط)",
      القيمة: stats.examSchedulesTotalAcrossFormations,
      الوصف: "مادة + قاعة + وقت عبر حسابات التشكيل النشطة",
    },
    {
      البند: "الامتحانات المنجزة",
      القيمة: stats.examsCompletedSituationSubmittedTotal,
      الوصف: "جلسات تم تأكيد رفع الموقف الامتحاني (كل حسابات الكلية)",
    },
    {
      البند: "امتحانات اليوم (كل حسابات الكلية)",
      القيمة: stats.examSessionsTodayTotal,
      الوصف: "توقيت بغداد",
    },
    {
      البند: "امتحانات الغد (باستثناء عطلة التشكيل)",
      القيمة: stats.examSessionsTomorrowExcludingHolidaysTotal,
      الوصف: "جلسات بتاريخ الغد التقويمي بعد استبعاد ما يقع في عطلة مسجّلة",
    },
    {
      البند: "المواقف المرفوعة",
      القيمة: stats.examsCompletedSituationSubmittedTotal,
      الوصف: "جلسات الجدول التي تم تأكيد رفع موقفها عبر حسابات الكلية",
    },
    {
      البند: "حسابات التشكيل",
      القيمة: stats.formationAccounts,
      الوصف: "تشكيلات مفعّلة في النظام",
    },
    {
      البند: "حسابات المتابعة",
      القيمة: stats.followupAccounts,
      الوصف: "حسابات متابعة مسجّلة",
    },
    {
      البند: "الأقسام والفروع (إجمالي)",
      القيمة: stats.collegeSubjectsTotal,
      الوصف: `أقسام: ${formatStatNumber(stats.collegeSubjectsDepartments)} · فروع: ${formatStatNumber(stats.collegeSubjectsBranches)}`,
    },
    {
      البند: "قاعات الامتحانات",
      القيمة: stats.examRoomsTotal,
      الوصف: "في جميع التشكيلات وحسابات المتابعة",
    },
    {
      البند: "المقاعد الامتحانية (سعة)",
      القيمة: stats.examSeatsCapacityTotal,
      الوصف: "صباحي + مسائي لكل القاعات",
    },
    {
      البند: "الغياب الإجمالي (طلبة)",
      القيمة: stats.totalStudentAbsenceAcrossFormations,
      الوصف: "كل حسابات الكلية — امتحان ١ و٢ في القاعة المزدوجة",
    },
    {
      البند: "المواد الدراسية",
      القيمة: stats.studySubjectsTotal,
      الوصف: "في جميع التشكيلات",
    },
    {
      البند: "الجدول الامتحاني (كل الجلسات — تشكيل + متابعة)",
      القيمة: stats.examSchedulesTotal,
      الوصف: `نهائي ${formatStatNumber(stats.examSchedulesFinal)} · فصلي ${formatStatNumber(stats.examSchedulesSemester)}`,
    },
    {
      البند: "القاعات الفعالة (تشكيل)",
      القيمة: stats.examRoomsWithScheduleFormationCount,
      الوصف: "قاعات لها جلسة في الجدول الامتحاني",
    },
    {
      البند: "القاعات غير النشطة (تشكيل)",
      القيمة: stats.examRoomsWithoutScheduleFormationCount,
      الوصف: "قاعات بلا جلسة جدول بعد",
    },
    {
      البند: "جلسات اليوم (تشكيل فقط)",
      القيمة: stats.examSessionsTodayFormationTotal,
      الوصف: "توقيت بغداد",
    },
    {
      البند: "حالات الغياب (تشكيل)",
      القيمة: stats.totalStudentAbsenceFormationAccounts,
      الوصف: "مجموع الغياب في قاعات حسابات التشكيل",
    },
    {
      البند: "متوسط الحضور المرجّح (تشكيلات لديها بيانات)",
      القيمة: stats.aggregateExamAttendancePct ?? "—",
      الوصف: "من إدخالات الحضور/الغياب في قاعات الجدول",
    },
    {
      البند: "إجمالي الجلسات المستقبلية (من اليوم — تشكيل)",
      القيمة: stats.upcomingExamSessionsFutureCountFormation,
      الوصف: "يُطابق عداد معاينة الامتحانات القادمة في اللوحة",
    },
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(بطاقات), "بطاقات");

  const weekStart = stats.examSessionsCurrentWeekStartIso;
  const نشاط_أسبوعي = WEEKDAY_LABELS_SAT_FIRST.map((اليوم, i) => ({
    اليوم,
    التاريخ: weekStart ? formatShortNumericDate(addDaysIsoDate(weekStart, i)) : "—",
    "بداية الأسبوع (سبت)": weekStart ?? "—",
    "عدد الجلسات": stats.examSessionsCurrentWeekByDaySatFirst[i] ?? 0,
  }));
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(نشاط_أسبوعي), "نشاط أسبوعي");

  const حضور_تشكيلات: {
    التشكيل: string;
    حاضر: number | string;
    غائب: number | string;
    "نسبة الحضور %": number | string;
  }[] = stats.formationAttendanceIndicators.map((r) => ({
    التشكيل: r.label,
    حاضر: r.present,
    غائب: r.absent,
    "نسبة الحضور %": r.attendancePct,
  }));
  حضور_تشكيلات.push({
    التشكيل: "— متوسط مرجّح (كل التشكيلات ذات بيانات) —",
    حاضر: "",
    غائب: "",
    "نسبة الحضور %": stats.aggregateExamAttendancePct ?? "—",
  });
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(حضور_تشكيلات), "حضور");

  const ملخص_سريع = [
    {
      المؤشر: "القاعات الفعالة",
      العدد: stats.examRoomsWithScheduleFormationCount,
      الشرح: "قاعات التشكيل المرتبطة بجدول امتحاني",
    },
    {
      المؤشر: "القاعات غير النشطة",
      العدد: stats.examRoomsWithoutScheduleFormationCount,
      الشرح: "قاعات التشكيل بلا جلسة جدول",
    },
    {
      المؤشر: "مراقبات اليوم (جلسات اليوم — تشكيل)",
      العدد: stats.examSessionsTodayFormationTotal,
      الشرح: "عدد جلسات الجدول لتاريخ اليوم بتوقيت بغداد",
    },
    {
      المؤشر: "حالات الغياب",
      العدد: stats.totalStudentAbsenceFormationAccounts,
      الشرح: "مجموع أعداد الغياب في قاعات التشكيل",
    },
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(ملخص_سريع), "ملخص");

  const قادمة = stats.upcomingExamSessionsPreview.map((r) => ({
    المادة: r.subjectName,
    التاريخ: r.examDateIso,
    الوقت: r.startTime,
    القاعة: r.roomName,
    التشكيل: r.formationLabel,
    الحالة: workflowStatusLabelAr(r.workflowStatus),
  }));
  قادمة.push({
    المادة: "— ملخص المعاينة —",
    التاريخ: "",
    الوقت: "",
    القاعة: `إجمالي جلسات مستقبلية (تشكيل): ${formatStatNumber(stats.upcomingExamSessionsFutureCountFormation)}`,
    التشكيل: `عدد الصفوف في الملف: ${formatStatNumber(stats.upcomingExamSessionsPreview.length)} (حد أقصى ${UPCOMING_EXAMS_DASHBOARD_PREVIEW_LIMIT})`,
    الحالة: "",
  });
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(قادمة), "قادمة");

  const safeName = `lohat-tahkom-${new Date().toISOString().slice(0, 10)}.xlsx`;
  xlsx.writeFile(wb, safeName);
}

/** عدد الصفوف الظاهرة قبل توسيع المعاينة داخل اللوحة */
const UPCOMING_TABLE_INITIAL_ROWS = 6;

function formatUpcomingExamDateAr(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${iso.trim()}T12:00:00.000Z`));
  } catch {
    return iso;
  }
}

function WorkflowStatusBadge({ workflow }: { workflow: DashboardUpcomingExamSessionRow["workflowStatus"] }) {
  const cfg =
    workflow === "APPROVED"
      ? { label: "معتمد", cls: "bg-emerald-100 text-emerald-800 ring-emerald-600/15" }
      : workflow === "REJECTED"
        ? { label: "مرفوض", cls: "bg-rose-100 text-rose-800 ring-rose-600/15" }
        : workflow === "SUBMITTED"
          ? { label: "مرفوع للمتابعة", cls: "bg-sky-100 text-sky-900 ring-sky-500/20" }
          : { label: "مسودة", cls: "bg-slate-100 text-slate-800 ring-slate-500/15" };
  return (
    <span
      className={`inline-flex max-w-[11rem] flex-wrap justify-end rounded-full px-2.5 py-1 text-[10px] font-extrabold leading-tight tracking-wide ring-1 sm:max-w-none sm:text-xs ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function UpcomingExamsSection({
  preview,
  futureTotal,
  previewLimit,
}: {
  preview: DashboardUpcomingExamSessionRow[];
  futureTotal: number;
  previewLimit: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? preview : preview.slice(0, UPCOMING_TABLE_INITIAL_ROWS);
  const hasMoreInPreview = preview.length > UPCOMING_TABLE_INITIAL_ROWS;
  const scrollWhenExpanded = expanded && preview.length > UPCOMING_TABLE_INITIAL_ROWS;

  return (
    <div className="overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-sm transition hover:shadow-md">
      <div className="flex flex-col gap-4 border-b border-[#E2E8F0] bg-[#F8FAFC]/50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#0F172A]">الامتحانات القادمة</h2>
          <p className="mt-1 text-sm text-[#64748B]">
            جلسات الجدول الامتحاني من اليوم فصاعداً لكل التشكيلات، مرتبة بالتاريخ ثم الوقت. المعاينة محدودة لتفادي
            بطء الصفحة.
          </p>
        </div>
        <Link
          href="/dashboard/exams"
          className="shrink-0 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-center text-xs font-bold text-[#1E3A8A] shadow-sm transition hover:border-[#2563EB]/35 hover:bg-[#EFF6FF]"
        >
          عرض كامل
        </Link>
      </div>
      <div
        className={`px-1 pb-1 ${scrollWhenExpanded ? "max-h-[min(26rem,70vh)] overflow-y-auto overflow-x-auto" : "overflow-x-auto"}`}
      >
        {preview.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-[#64748B]">
            لا توجد جلسات مجدولة من تاريخ اليوم فصاعداً لحسابات التشكيل.
          </p>
        ) : (
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-right text-sm">
            <thead className="sticky top-0 z-10 bg-[#F1F5F9] shadow-[0_1px_0_#E2E8F0]">
              <tr className="border-b-2 border-[#E2E8F0]">
                <th className="px-4 py-4 text-xs font-extrabold uppercase tracking-wider text-[#475569] sm:px-7 sm:py-5 sm:text-sm first:rounded-tr-2xl">
                  المادة
                </th>
                <th className="px-4 py-4 text-xs font-extrabold uppercase tracking-wider text-[#475569] sm:px-7 sm:py-5 sm:text-sm">
                  التاريخ والوقت
                </th>
                <th className="px-4 py-4 text-xs font-extrabold uppercase tracking-wider text-[#475569] sm:px-7 sm:py-5 sm:text-sm">
                  القاعة
                </th>
                <th className="px-4 py-4 text-xs font-extrabold uppercase tracking-wider text-[#475569] sm:px-7 sm:py-5 sm:text-sm">
                  التشكيل
                </th>
                <th className="px-4 py-4 text-xs font-extrabold uppercase tracking-wider text-[#475569] sm:px-7 sm:py-5 sm:text-sm last:rounded-tl-2xl">
                  الحالة
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {visibleRows.map((row) => (
                <tr
                  key={row.scheduleId}
                  className="bg-white transition-colors hover:bg-[#F8FAFC]"
                >
                  <td className="px-4 py-3.5 font-semibold text-[#0F172A] sm:px-7 sm:py-4.5">{row.subjectName}</td>
                  <td className="px-4 py-3.5 text-[#64748B] sm:px-7 sm:py-4.5">
                    <span className="block text-sm font-semibold text-[#334155]">
                      {formatUpcomingExamDateAr(row.examDateIso)}
                    </span>
                    <span className="mt-0.5 block text-xs tabular-nums text-[#94A3B8]">{row.startTime}</span>
                  </td>
                  <td className="px-4 py-3.5 text-[#64748B] sm:px-7 sm:py-4.5">{row.roomName}</td>
                  <td className="max-w-[10rem] truncate px-4 py-3.5 text-[#64748B] sm:max-w-[14rem] sm:px-7 sm:py-4.5" title={row.formationLabel}>
                    {row.formationLabel}
                  </td>
                  <td className="px-4 py-3.5 sm:px-7 sm:py-4.5">
                    <WorkflowStatusBadge workflow={row.workflowStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {preview.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-[#E2E8F0] bg-[#F8FAFC]/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-[11px] leading-relaxed text-[#64748B] sm:text-xs">
            <span className="font-semibold text-[#475569] tabular-nums">{formatStatNumber(visibleRows.length)}</span>
            {" من "}
            <span className="tabular-nums">{formatStatNumber(preview.length)}</span>
            {" جلسة في المعاينة"}
            {futureTotal > preview.length ? (
              <>
                {" — إجمالي الجلسات من اليوم فصاعداً: "}
                <span className="font-semibold text-[#475569] tabular-nums">{formatStatNumber(futureTotal)}</span>
                {futureTotal > previewLimit ? (
                  <span> (يُحمَّل هنا حتى {formatStatNumber(previewLimit)} جلسة)</span>
                ) : null}
              </>
            ) : futureTotal > 0 ? (
              <>
                {" — إجمالي الجلسات: "}
                <span className="font-semibold text-[#475569] tabular-nums">{formatStatNumber(futureTotal)}</span>
              </>
            ) : null}
            . للقائمة الكاملة والفلترة استخدم «عرض كامل».
          </p>
          {hasMoreInPreview ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 rounded-xl border border-[#CBD5E1] bg-white px-4 py-2 text-xs font-bold text-[#1E3A8A] shadow-sm transition hover:border-[#2563EB]/30 hover:bg-[#EFF6FF]"
            >
              {expanded ? "إظهار أقل" : `عرض المزيد (${formatStatNumber(preview.length - UPCOMING_TABLE_INITIAL_ROWS)})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WeeklyActivityChart({
  sessionCounts,
  weekStartIso,
}: {
  sessionCounts: number[];
  weekStartIso: string | null;
}) {
  const uid = useId().replace(/:/g, "");
  const fillGradId = `chart-fill-${uid}`;
  const lineGradId = `chart-line-${uid}`;

  const [hovered, setHovered] = useState<number | null>(null);

  const counts = useMemo(() => {
    if (sessionCounts.length === 7) return sessionCounts;
    return [0, 0, 0, 0, 0, 0, 0];
  }, [sessionCounts]);

  /** قيم مرئية 0–100 نسبة إلى أعلى عدد جلسات في الأسبوع */
  const activityValues = useMemo(() => {
    const maxC = Math.max(1, ...counts);
    return counts.map((c) => (c / maxC) * 100);
  }, [counts]);

  const w = 560;
  const h = 220;
  const pad = { t: 16, r: 12, b: 36, l: 12 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxV = 100;
  const coords = activityValues.map((v, i) => {
    const x = pad.l + (i / (activityValues.length - 1)) * innerW;
    const y = pad.t + innerH - (v / maxV) * innerH;
    return { x, y };
  });
  const lineD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaD = `${lineD} L ${coords[coords.length - 1].x} ${pad.t + innerH} L ${coords[0].x} ${pad.t + innerH} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => pad.t + t * innerH);

  const tooltipLeftPct = hovered !== null ? (coords[hovered].x / w) * 100 : 0;
  const tooltipTopPct = hovered !== null ? (coords[hovered].y / h) * 100 : 0;

  return (
    <div className="relative w-full overflow-hidden rounded-3xl" dir="ltr">
      <div className="relative">
        {hovered !== null ? (
          <div
            className="pointer-events-none absolute z-20 min-w-[7.5rem] -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-center shadow-[0_12px_40px_rgba(15,23,42,0.14),0_4px_12px_rgba(37,99,235,0.12)] ring-1 ring-[#2563EB]/10"
            style={{ left: `${tooltipLeftPct}%`, top: `${tooltipTopPct}%` }}
            role="tooltip"
          >
            <p className="text-[11px] font-bold text-[#64748B]">{WEEKDAY_LABELS_SAT_FIRST[hovered]}</p>
            {weekStartIso ? (
              <p className="text-[10px] font-semibold text-[#94A3B8]">
                {formatShortNumericDate(addDaysIsoDate(weekStartIso, hovered))}
              </p>
            ) : null}
            <p className="mt-0.5 text-xl font-bold tabular-nums text-[#1E3A8A]">
              {formatStatNumber(counts[hovered])}
            </p>
            <p className="text-[10px] font-semibold text-[#94A3B8]">
              {counts[hovered] === 1 ? "جلسة امتحانية" : "جلسات امتحانية"}
            </p>
            <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-[#E2E8F0] bg-white" />
          </div>
        ) : null}

        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            <linearGradient id={fillGradId} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
              <stop offset="0%" stopColor="rgb(37, 99, 235)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="rgb(37, 99, 235)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={lineGradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#1E3A8A" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
          </defs>
          {gridLines.map((gy, i) => (
            <line
              key={i}
              x1={pad.l}
              y1={gy}
              x2={w - pad.r}
              y2={gy}
              stroke="#E2E8F0"
              strokeWidth={1}
              strokeDasharray="4 6"
            />
          ))}
          <path d={areaD} fill={`url(#${fillGradId})`} />
          <path
            d={lineD}
            fill="none"
            stroke={`url(#${lineGradId})`}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {coords.map((c, i) => {
            const active = hovered === i;
            return (
              <g key={i}>
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={20}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(i)}
                />
                {active ? (
                  <circle cx={c.x} cy={c.y} r={16} fill="none" stroke="#2563EB" strokeOpacity={0.18} strokeWidth={1.5} />
                ) : null}
                <g
                  className="pointer-events-none"
                  style={{
                    transform: `translate(${c.x}px, ${c.y}px) scale(${active ? 1.38 : 1})`,
                    transformOrigin: "0 0",
                    transition: "transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                >
                  <circle cx={0} cy={0} r={4} fill="#FFFFFF" stroke="#2563EB" strokeWidth={active ? 2.75 : 2} />
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      <div
        className="flex justify-between border-t border-[#E2E8F0] px-2 pb-1 pt-3 text-[11px] font-semibold text-[#64748B] sm:text-xs"
        dir="rtl"
      >
        {WEEKDAY_LABELS_SAT_FIRST.map((d) => (
          <span key={d} className="flex-1 text-center">
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

type DashboardOverviewProps = {
  universityStats: UniversityWideDashboardStats;
};

export function DashboardOverview({ universityStats }: DashboardOverviewProps) {
  const router = useRouter();
  useEffect(() => {
    return subscribeUniversityDashboardStale(() => {
      router.refresh();
    });
  }, [router]);

  const formationAttendanceRows = useMemo(
    () => universityStats.formationAttendanceIndicators,
    [universityStats.formationAttendanceIndicators]
  );

  const quickSummaryItems = useMemo(
    () =>
      [
        {
          label: "القاعات الفعالة",
          value: formatStatNumber(universityStats.examRoomsWithScheduleFormationCount),
          danger: false as const,
          title: "عدد قاعات التشكيل التي لها جلسة واحدة على الأقل في الجدول الامتحاني (إجمالي كل التشكيلات)",
        },
        {
          label: "القاعات غير النشطة",
          value: formatStatNumber(universityStats.examRoomsWithoutScheduleFormationCount),
          danger: false as const,
          title: "عدد قاعات التشكيل غير المرتبطة بأي جلسة في الجدول الامتحاني بعد",
        },
        {
          label: "مراقبات اليوم",
          value: formatStatNumber(universityStats.examSessionsTodayFormationTotal),
          danger: false as const,
          title:
            "عدد جلسات الجدول الامتحاني المجدولة لتاريخ اليوم (توقيت بغداد) لكل التشكيلات — مؤشر لحجم الامتحانات اليومية",
        },
        {
          label: "حالات الغياب",
          value: formatStatNumber(universityStats.totalStudentAbsenceFormationAccounts),
          danger: true as const,
          title: "مجموع أعداد الطلبة الغائبين المدخلة في قاعات التشكيل (الامتحان الأول والثاني في القاعة المزدوجة)",
        },
      ] as const,
    [universityStats]
  );

  const [exporting, setExporting] = useState(false);
  const onExportDashboardReports = useCallback(async () => {
    setExporting(true);
    try {
      await exportUniversityDashboardExcel(universityStats);
    } catch {
      window.alert("تعذر تصدير التقرير. أعد المحاولة.");
    } finally {
      setExporting(false);
    }
  }, [universityStats]);

  const universityStatCards = useMemo(
    () =>
      [
        {
          title: "حسابات التشكيل",
          value: formatStatNumber(universityStats.formationAccounts),
          sub: "تشكيلات وكليات مفعّلة في النظام",
          accent: "#2563EB",
          badgeClass: "bg-blue-50 text-blue-900 ring-blue-500/25",
          titleClass: "text-blue-900/80",
          hoverShadow: "hover:shadow-[0_12px_28px_rgba(37,99,235,0.14)]",
        },
        {
          title: "حسابات المتابعة",
          value: formatStatNumber(universityStats.followupAccounts),
          sub: "حسابات متابعة مسجّلة",
          accent: "#6366F1",
          badgeClass: "bg-indigo-50 text-indigo-900 ring-indigo-500/25",
          titleClass: "text-indigo-900/80",
          hoverShadow: "hover:shadow-[0_12px_28px_rgba(99,102,241,0.14)]",
        },
        {
          title: "الأقسام والفروع",
          value: formatStatNumber(universityStats.collegeSubjectsTotal),
          sub: "في كل التشكيلات النشطة",
          detail: `أقسام: ${formatStatNumber(universityStats.collegeSubjectsDepartments)} · فروع: ${formatStatNumber(universityStats.collegeSubjectsBranches)} · الإجمالي: ${formatStatNumber(universityStats.collegeSubjectsTotal)}`,
          accent: "#0D9488",
          badgeClass: "bg-teal-50 text-teal-900 ring-teal-500/25",
          titleClass: "text-teal-900/80",
          hoverShadow: "hover:shadow-[0_12px_28px_rgba(13,148,136,0.14)]",
        },
        {
          title: "قاعات الامتحانات",
          value: formatStatNumber(universityStats.examRoomsTotal),
          sub: "في جميع التشكيلات",
          accent: "#0891B2",
          badgeClass: "bg-cyan-50 text-cyan-900 ring-cyan-500/25",
          titleClass: "text-cyan-900/80",
          hoverShadow: "hover:shadow-[0_12px_28px_rgba(8,145,178,0.14)]",
        },
        {
          title: "المقاعد الامتحانية",
          value: formatStatNumber(universityStats.examSeatsCapacityTotal),
          sub: "مجموع السعة (صباحي + مسائي) لكل القاعات",
          accent: "#CA8A04",
          badgeClass: "bg-amber-50 text-amber-900 ring-amber-500/25",
          titleClass: "text-amber-900/80",
          hoverShadow: "hover:shadow-[0_12px_28px_rgba(202,138,4,0.16)]",
        },
        {
          title: "الغياب الإجمالي (الطلبة)",
          value: formatStatNumber(universityStats.totalStudentAbsenceAcrossFormations),
          sub: "مجموع أعداد الغياب المدخلة في قاعات كل التشكيلات (الامتحان الأول + الثاني في القاعة المزدوجة).",
          accent: "#DC2626",
          badgeClass: "bg-red-50 text-red-900 ring-red-500/25",
          titleClass: "text-red-900/80",
          hoverShadow: "hover:shadow-[0_12px_28px_rgba(220,38,38,0.16)]",
        },
        {
          title: "المواد الدراسية",
          value: formatStatNumber(universityStats.studySubjectsTotal),
          sub: "في جميع التشكيلات",
          accent: "#7C3AED",
          badgeClass: "bg-violet-50 text-violet-900 ring-violet-500/25",
          titleClass: "text-violet-900/80",
          hoverShadow: "hover:shadow-[0_12px_28px_rgba(124,58,237,0.14)]",
        },
        {
          title: "الجدول الامتحاني",
          value: formatStatNumber(universityStats.examSchedulesTotal),
          sub: `نهائي ${formatStatNumber(universityStats.examSchedulesFinal)} · فصلي ${formatStatNumber(universityStats.examSchedulesSemester)} — كل حسابات الكلية (تشكيل + متابعة)`,
          accent: "#DB2777",
          badgeClass: "bg-pink-50 text-pink-900 ring-pink-500/25",
          titleClass: "text-pink-900/80",
          hoverShadow: "hover:shadow-[0_12px_28px_rgba(219,39,119,0.14)]",
        },
      ],
    [universityStats]
  );

  const topHighlightCards = useMemo(
    () =>
      [
        {
          title: "الامتحانات المنجزة",
          value: formatStatNumber(universityStats.examsCompletedSituationSubmittedTotal),
          sub: "عدد جلسات الجدول الامتحاني التي تم تأكيد رفع الموقف الامتحاني لها عبر حسابات الكلية النشطة.",
          accent: "#10B981",
          badgeClass: "bg-emerald-50 text-emerald-800 ring-emerald-500/20",
          titleClass: "text-emerald-900/80",
          hoverShadow: "hover:shadow-[0_12px_28px_rgba(16,185,129,0.14)]",
        },
        {
          title: "امتحانات اليوم",
          value: formatStatNumber(universityStats.examSessionsTodayTotal),
          sub: "إجمالي جلسات الجدول الامتحاني المجدولة لتاريخ اليوم (توقيت بغداد).",
          extraLine: `غدًا: ${formatStatNumber(universityStats.examSessionsTomorrowExcludingHolidaysTotal)} جلسة — باستثناء ما يقع في يوم عطلة مسجّل لتشكيله`,
          accent: "#F59E0B",
          badgeClass: "bg-amber-50 text-amber-900 ring-amber-500/25",
          titleClass: "text-amber-900/75",
          hoverShadow: "hover:shadow-[0_12px_28px_rgba(245,158,11,0.18)]",
        },
        {
          title: "المواقف المرفوعة",
          value: formatStatNumber(universityStats.examsCompletedSituationSubmittedTotal),
          sub: "جلسات الجدول التي تم تأكيد رفع موقفها عبر حسابات الكلية.",
          accent: "#0EA5E9",
          badgeClass: "bg-sky-50 text-sky-900 ring-sky-500/25",
          titleClass: "text-sky-900/75",
          hoverShadow: "hover:shadow-[0_12px_28px_rgba(14,165,233,0.14)]",
        },
      ],
    [universityStats]
  );

  return (
    <div className="space-y-8" dir="rtl">
      {/* ترحيب + إجراءات */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl min-w-0 space-y-3 lg:max-w-none lg:flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A] md:text-4xl">لوحة التحكم</h1>
          <p className="text-base leading-relaxed text-[#64748B] md:text-lg lg:whitespace-nowrap lg:text-[clamp(0.8125rem,0.55vw+0.65rem,1.125rem)] lg:leading-snug xl:text-lg">
            متابعة شاملة لحالة الامتحانات، أعداد الطلبة، المؤشرات اليومية، والعمليات الإدارية في واجهة حديثة ومريحة بصريًا.
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-3">
          <button
            type="button"
            disabled={exporting}
            onClick={() => void onExportDashboardReports()}
            className="rounded-2xl border border-[#E2E8F0] bg-white px-5 py-2.5 text-sm font-bold text-[#1E3A8A] shadow-sm transition hover:border-[#2563EB]/30 hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
          >
            {exporting ? "جاري التصدير…" : "تصدير التقارير"}
          </button>
        </div>
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div
          className="group relative isolate overflow-hidden rounded-3xl p-6 text-white ring-1 ring-white/20 transition-all duration-300 ease-out will-change-transform hover:-translate-y-[4px] hover:shadow-[0_18px_48px_rgba(37,99,235,0.38)]"
          style={{
            background: "linear-gradient(135deg, #1E3A8A, #2563EB)",
            boxShadow: "0 10px 30px rgba(37, 99, 235, 0.25)",
          }}
        >
          <div
            className="pointer-events-none absolute -left-12 -top-12 size-44 rounded-full bg-white/[0.12] blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-20 -right-8 size-56 rounded-full bg-sky-300/30 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-white/35 to-transparent"
            aria-hidden
          />
          <div className="relative">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="min-w-0 text-sm font-semibold text-white/90">إجمالي الامتحانات</p>
              <span className="inline-flex shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-white ring-1 ring-white/30 backdrop-blur-[2px]">
                مباشر
              </span>
            </div>
            <p className="mt-2 text-4xl font-bold tracking-tight text-white drop-shadow-sm md:text-5xl tabular-nums">
              {formatStatNumber(universityStats.examSchedulesTotalAcrossFormations)}
            </p>
            <p className="mt-2 text-sm text-white/80">
              جلسات الجدول الامتحاني (مادة + قاعة + وقت) عبر كل حسابات التشكيل النشطة
            </p>
          </div>
        </div>

        {topHighlightCards.map((card) => (
          <div
            key={card.title}
            className={`group rounded-3xl border border-[#E2E8F0] border-t-4 bg-white p-6 shadow-sm shadow-[#0F172A]/[0.04] transition duration-300 hover:-translate-y-1 hover:shadow-md ${card.hoverShadow}`}
            style={{ borderTopColor: card.accent }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className={`min-w-0 text-sm font-semibold ${card.titleClass}`}>{card.title}</p>
              <span
                className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ${card.badgeClass}`}
              >
                مباشر
              </span>
            </div>
            <p
              className={`mt-2 text-4xl font-bold tracking-tight tabular-nums ${"warn" in card && card.warn ? "text-[#EF4444]" : "text-[#0F172A]"}`}
            >
              {card.value}
            </p>
            <p className="mt-2 text-sm text-[#64748B]">{card.sub}</p>
            {"extraLine" in card && card.extraLine ? (
              <p className="mt-2 text-[11px] font-semibold leading-snug text-[#94A3B8] tabular-nums md:text-xs">
                {card.extraLine}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {/* إحصائيات التشكيلات والجامعة — من قاعدة البيانات */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-[#0F172A] md:text-xl">إحصائيات التشكيلات والجامعة</h2>
          <p className="mt-1 text-sm text-[#64748B] md:text-base">
            أرقام إجمالية موحّدة عبر كل حسابات الكلية النشطة في النظام (تشكيل ومتابعة).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {universityStatCards.map((card) => (
            <div
              key={card.title}
              className={`group rounded-3xl border border-[#E2E8F0] border-t-4 bg-white p-6 shadow-sm shadow-[#0F172A]/[0.04] transition duration-300 hover:-translate-y-1 hover:shadow-md ${card.hoverShadow}`}
              style={{ borderTopColor: card.accent }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className={`min-w-0 text-sm font-semibold ${card.titleClass}`}>{card.title}</p>
                <span
                  className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ${card.badgeClass}`}
                >
                  مباشر
                </span>
              </div>
              <p className="mt-2 text-4xl font-bold tracking-tight text-[#0F172A] md:text-5xl">{card.value}</p>
              <p className="mt-2 text-sm leading-relaxed text-[#64748B]">{card.sub}</p>
              {"detail" in card && card.detail ? (
                <p className="mt-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[11px] font-semibold leading-relaxed text-[#475569] tabular-nums md:text-xs">
                  {card.detail}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* رسوم ومؤشرات */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition hover:shadow-md">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">النشاط الأسبوعي</h2>
                <p className="mt-1 text-sm text-[#64748B]">
                  جلسات الجدول الامتحاني حسب يوم الأسبوع للأسبوع الحالي (سبت—جمعة، بغداد)، مجمّعة على كل التشكيلات
                  النشطة.
                </p>
              </div>
              <span className="shrink-0 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-xs font-bold text-[#1E3A8A]">
                أسبوع حالي
              </span>
            </div>
            <div className="rounded-2xl bg-gradient-to-b from-[#EFF6FF] to-white p-4 ring-1 ring-[#E2E8F0]/80">
              <WeeklyActivityChart
                sessionCounts={universityStats.examSessionsCurrentWeekByDaySatFirst}
                weekStartIso={universityStats.examSessionsCurrentWeekStartIso}
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition hover:shadow-md">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">مؤشر الحضور</h2>
                <p className="text-xs text-[#64748B]">
                  نسبة الحضور من أعداد الحضور/الغياب في قاعات الجدول — أبرز أربع تشكيلات بحسب حجم الإدخال.
                </p>
              </div>
              {universityStats.aggregateExamAttendancePct !== null ? (
                <span
                  className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-[#10B981] ring-1 ring-emerald-500/20 tabular-nums"
                  title="متوسط مرجّح لكل التشكيلات التي لديها بيانات"
                >
                  متوسط {universityStats.aggregateExamAttendancePct}%
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold text-[#94A3B8] ring-1 ring-[#E2E8F0]">
                  لا بيانات
                </span>
              )}
            </div>
            {formationAttendanceRows.length === 0 ? (
              <p className="text-sm leading-relaxed text-[#64748B]">
                لا توجد أعداد حضور أو غياب مسجّلة بعد في قاعات الجدول لحسابات التشكيل.
              </p>
            ) : (
              <ul className="space-y-4">
                {formationAttendanceRows.map((row, idx) => (
                  <li key={`${row.label}-${idx}`}>
                    <div className="mb-1.5 flex justify-between gap-2 text-xs font-semibold">
                      <span className="min-w-0 truncate text-[#0F172A]" title={row.label}>
                        {row.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-[#64748B]">{row.attendancePct}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[#F1F5F9]">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-[#1E3A8A] to-[#2563EB] transition-all duration-500"
                        style={{ width: `${row.attendancePct}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition hover:shadow-md">
            <h2 className="mb-4 text-lg font-bold text-[#0F172A]">ملخص سريع</h2>
            <div className="grid grid-cols-2 gap-3">
              {quickSummaryItems.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]/80 p-4 text-right transition hover:border-[#2563EB]/20"
                  title={item.title}
                >
                  <p className="text-xs font-semibold text-[#64748B]">{item.label}</p>
                  <p className={`mt-1 text-2xl font-bold tabular-nums ${item.danger ? "text-[#EF4444]" : "text-[#0F172A]"}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <UpcomingExamsSection
        preview={universityStats.upcomingExamSessionsPreview}
        futureTotal={universityStats.upcomingExamSessionsFutureCountFormation}
        previewLimit={UPCOMING_EXAMS_DASHBOARD_PREVIEW_LIMIT}
      />
    </div>
  );
}
