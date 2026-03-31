"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CollegeStatisticsPageData } from "@/lib/college-statistics-page";

const BORDER = "#E2E8F0";
const MUTED = "#64748B";
const BLUE_MID = "#2563EB";
const CHART_PRIMARY = "#1e40af";
const CHART_SOFT = "#94a3b8";
const CHART_LIGHT = "#cbd5e1";

const TIMELINE_STROKES = ["#1e3a8a", "#2563eb", "#3b82f6", "#64748b", "#475569"];

const tooltipStyle = {
  borderRadius: 12,
  border: `1px solid ${BORDER}`,
  fontSize: 12,
};

function formatNum(n: number): string {
  try {
    return n.toLocaleString("en-US");
  } catch {
    return String(n);
  }
}

function formatExamDateShort(iso: string): string {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    return `${d}/${m}`;
  } catch {
    return iso;
  }
}

function formatGeneratedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "Asia/Baghdad",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="statistics-print-avoid-break relative flex h-[100px] flex-col justify-between overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-sm print:h-auto print:min-h-[5.5rem] print:shadow-none xl:h-[104px] xl:p-3.5">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-[#1E3A8A] to-[#2563EB]"
        aria-hidden
      />
      <div className="min-w-0 pr-0.5">
        <p className="text-[10px] font-bold leading-tight text-[#64748B] xl:text-[11px]">{title}</p>
        <p className="mt-0.5 text-3xl font-extrabold tabular-nums tracking-tight text-[#0F172A] xl:text-4xl xl:leading-none">
          {typeof value === "number" ? formatNum(value) : value}
        </p>
      </div>
      {hint ? (
        <p
          className="min-w-0 truncate text-[10px] leading-tight text-[#94A3B8] print:max-w-none print:whitespace-normal print:overflow-visible print:text-[8.5pt] xl:text-[11px]"
          title={hint}
        >
          {hint}
        </p>
      ) : (
        <span className="block min-h-[14px]" aria-hidden />
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
  chartClassName = "h-[260px]",
  printChartAreaClass = "statistics-print-chart-area",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  chartClassName?: string;
  /** ارتفاع منطقة الرسم عند الطباعة (A4) — يُربَط بأنماط globals.css */
  printChartAreaClass?: "statistics-print-chart-area" | "statistics-print-chart-area--tall" | "statistics-print-chart-area--wide";
}) {
  return (
    <div
      className={`statistics-print-avoid-break rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm print:rounded-lg print:p-3 print:shadow-none ${className ?? ""}`}
    >
      <h3 className="text-base font-bold text-[#0F172A] print:text-[11pt]">{title}</h3>
      {subtitle ? <p className="mt-1 text-xs text-[#64748B] print:text-[8.5pt]">{subtitle}</p> : null}
      <div className={`mt-4 w-full min-w-0 ${chartClassName} ${printChartAreaClass}`}>{children}</div>
    </div>
  );
}

function ReportTable({
  caption,
  children,
  className,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white shadow-sm print:shadow-none ${className ?? ""}`}
    >
      <table className="w-full min-w-[520px] border-collapse text-right text-sm print:text-[8.5pt]">
        <caption className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-start text-xs font-bold text-[#334155] print:bg-[#f1f5f9] print:text-[9pt]">
          {caption}
        </caption>
        {children}
      </table>
    </div>
  );
}

const NAV_LINKS: { href: string; label: string; hash: string }[] = [
  { href: "/dashboard/college/subjects", label: "الأقسام والفروع", hash: "report-branches" },
  { href: "/dashboard/college/study-subjects", label: "المواد الدراسية", hash: "report-study" },
  { href: "/dashboard/college/rooms-management", label: "إدارة القاعات", hash: "report-rooms" },
  { href: "/dashboard/college/exam-schedules", label: "الجداول الامتحانية", hash: "report-schedules" },
  { href: "/dashboard/college/upload-status", label: "رفع الموقف", hash: "report-upload" },
  { href: "/dashboard/college/status-followup", label: "متابعة المواقف", hash: "report-followup" },
];

export function CollegeStatisticsPanel({
  collegeLabel,
  data,
}: {
  collegeLabel: string;
  data: CollegeStatisticsPageData;
}) {
  const { snapshot, dayUploads, branchRows, rooms, deanBreakdown, schedulesByStudyType, roomCapacitySummary, generatedAtIso } =
    data;

  const workflowPieData = [
    { name: "مسودة", value: snapshot.schedules.draft, fill: "#475569" },
    { name: "مرفوع للمتابعة", value: snapshot.schedules.submitted, fill: BLUE_MID },
    { name: "معتمد", value: snapshot.schedules.approved, fill: CHART_PRIMARY },
    { name: "مرفوض", value: snapshot.schedules.rejected, fill: CHART_SOFT },
  ].filter((d) => d.value > 0);

  const uploadPieData = [
    { name: "مرفوع", value: snapshot.situations.uploaded, fill: CHART_PRIMARY },
    { name: "غير مرفوع", value: snapshot.situations.notUploaded, fill: CHART_LIGHT },
  ].filter((d) => d.value > 0);

  const completePieData = [
    { name: "مكتمل", value: snapshot.situations.complete, fill: BLUE_MID },
    { name: "غير مكتمل", value: snapshot.situations.incomplete, fill: CHART_SOFT },
  ].filter((d) => d.value > 0);

  const studyBarData = snapshot.studySubjects.byType.filter((x) => x.count > 0).map((x) => ({ name: x.label, count: x.count }));

  const examByTypeBar = schedulesByStudyType.filter((x) => x.count > 0).map((x) => ({ name: x.label, count: x.count }));

  const branchSubjectChartData = snapshot.byBranchSubjects.map((r) => ({
    ...r,
    labelShort: r.branchName.length > 26 ? `${r.branchName.slice(0, 24)}…` : r.branchName,
  }));

  const examStackData = snapshot.byBranchExamProgress.map((r) => ({
    ...r,
    labelShort: r.branchName.length > 16 ? `${r.branchName.slice(0, 14)}…` : r.branchName,
  }));
  const examStackChartData = examStackData.filter((r) => r.total > 0);

  const examDayData = snapshot.examDays.byDate.map((x) => ({
    name: formatExamDateShort(x.date),
    sessions: x.sessions,
    fullDate: x.date,
  }));

  const deanPieData = [
    { name: "معتمد من العميد", value: deanBreakdown.approved, fill: CHART_PRIMARY },
    { name: "مرفوض", value: deanBreakdown.rejected, fill: "#475569" },
    { name: "قيد المراجعة", value: deanBreakdown.pending, fill: BLUE_MID },
    { name: "دون قرار / مسودة", value: deanBreakdown.none, fill: CHART_LIGHT },
  ].filter((d) => d.value > 0);

  const branchHint =
    snapshot.branches.total === 0
      ? "أضف أقساماً من صفحة الأقسام والفروع"
      : `${formatNum(snapshot.branches.departments)} قسم · ${formatNum(snapshot.branches.branchFaculties)} فرع`;

  const typesInUse = snapshot.studySubjects.byType.filter((x) => x.count > 0).length;

  useEffect(() => {
    const onBefore = () => document.body.classList.add("printing-college-statistics");
    const onAfter = () => document.body.classList.remove("printing-college-statistics");
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
      document.body.classList.remove("printing-college-statistics");
    };
  }, []);

  return (
    <div id="statistics-print-root" className="space-y-10 print:space-y-5" dir="rtl">
      {/* غلاف رسمي يظهر فقط عند الطباعة — A4 */}
      <div className="hidden print:block statistics-print-avoid-break border-b-2 border-[#1E3A8A] pb-4 text-center">
        <p className="text-[11pt] font-bold tracking-wide text-[#1E3A8A]">جامعة البصرة</p>
        <p className="mt-1 text-[9pt] text-[#475569]">نظام رصين لإدارة الامتحانات</p>
        <h1 className="mt-4 text-[15pt] font-black leading-snug text-[#0F172A]">
          تقرير الإحصائيات والتقارير الشامل
        </h1>
        <p className="mt-3 text-[11pt] font-semibold text-[#334155]">التشكيل / الكلية: {collegeLabel}</p>
        <div className="mx-auto mt-4 max-w-xl rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-start text-[9pt] text-[#475569]">
          <p>
            <span className="font-bold text-[#334155]">تاريخ ووقت إصدار التقرير (بغداد): </span>
            <span className="font-mono tabular-nums">{formatGeneratedAt(generatedAtIso)}</span>
          </p>
          <p className="mt-2 leading-relaxed">
            يتضمن هذا المستند جميع الأقسام المعروضة في صفحة الإحصائيات: المؤشرات العامة، جداول الأقسام
            والمواد والقاعات، الجداول الامتحانية، رفع المواقف، متابعة اعتماد العميد، والرسوم البيانية
            والبيانات التفصيلية المرتبطة بها.
          </p>
        </div>
      </div>

      <header className="relative min-h-[96px] overflow-hidden rounded-2xl border border-[#E8EEF7] bg-white px-5 py-3.5 shadow-[0_6px_20px_rgba(15,23,42,0.05)] print:hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-[#1E3A8A] via-[#2563EB] to-[#3B82F6]"
          aria-hidden
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-wide text-[#2563EB]">الإحصائيات والتقارير</p>
            <h1 className="mt-1 text-xl font-bold leading-tight text-[#0F172A] md:text-2xl">ملخص النظام الامتحاني</h1>
            <p className="mt-1.5 max-w-[46rem] text-xs leading-snug text-[#64748B] md:text-[13px]">
              أرقام وتقارير مفصّلة عن <strong className="font-semibold text-[#475569]">{collegeLabel}</strong> تغطي
              الأقسام، المواد، القاعات، الجداول، رفع المواقف، ومتابعة اعتماد العميد. تُحدَّث عند فتح الصفحة.
            </p>
            <p className="mt-2 text-[11px] tabular-nums text-[#94A3B8]">
              وقت إنشاء التقرير (بغداد): {formatGeneratedAt(generatedAtIso)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              document.body.classList.add("printing-college-statistics");
              requestAnimationFrame(() => {
                window.print();
              });
            }}
            className="shrink-0 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 text-xs font-bold text-[#1E3A8A] shadow-sm transition hover:bg-white print:hidden"
          >
            طباعة التقرير الرسمي (A4)
          </button>
        </div>
      </header>

      <nav
        className="flex flex-wrap gap-2 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 print:hidden"
        aria-label="انتقال سريع للأقسام"
      >
        {NAV_LINKS.map((n) => (
          <a
            key={n.hash}
            href={`#${n.hash}`}
            className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] shadow-sm transition hover:border-[#1E3A8A]/30 hover:text-[#1E3A8A]"
          >
            {n.label}
          </a>
        ))}
      </nav>

      <section aria-labelledby="global-kpis" className="print:pt-1">
        <h2
          id="global-kpis"
          className="mb-4 border-b border-[#E2E8F0] pb-2 text-sm font-bold text-[#334155] print:text-[11pt] print:font-black print:text-[#0F172A]"
        >
          مؤشرات عامة
        </h2>
        <div className="statistics-kpi-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-2">
          <StatCard title="الأقسام والفروع" value={snapshot.branches.total} hint={branchHint} />
          <StatCard
            title="المواد الدراسية"
            value={snapshot.studySubjects.total}
            hint={
              typesInUse === 0 ? "لم تُسجّل مواد بعد" : `${formatNum(typesInUse)} نوع دراسة مستخدم في التشكيل`
            }
          />
          <StatCard title="قاعات الامتحان" value={snapshot.rooms.total} hint="مسجّلة في إدارة القاعات" />
          <StatCard
            title="إجمالي سعة القاعات (المادة الأولى)"
            value={roomCapacitySummary.sumCapacityTotal}
            hint={`مجموع حقل السعة الإجمالية · قاعات بامتحانين: ${formatNum(roomCapacitySummary.roomsWithDualExam)}`}
          />
          <StatCard
            title="المشرفون (بدون تكرار)"
            value={snapshot.people.uniqueSupervisors}
            hint="من بيانات القاعات"
          />
          <StatCard
            title="المراقبون (بدون تكرار)"
            value={snapshot.people.uniqueInvigilators}
            hint="أسماء فريدة من قوائم المراقبين"
          />
          <StatCard
            title="جلسات الجدول"
            value={snapshot.schedules.total}
            hint={`مسودة ${formatNum(snapshot.schedules.draft)} · مرفوع ${formatNum(snapshot.schedules.submitted)} · معتمد ${formatNum(snapshot.schedules.approved)} · مرفوض ${formatNum(snapshot.schedules.rejected)}`}
          />
          <StatCard
            title="جلسات الموقف الامتحاني"
            value={snapshot.situations.totalRows}
            hint={`مرفوع ${formatNum(snapshot.situations.uploaded)} · غير مرفوع ${formatNum(snapshot.situations.notUploaded)}`}
          />
          <StatCard
            title="الحضور / الغياب (إجمالي السجلات)"
            value={snapshot.studentAttendanceSummary.total}
            hint={`حاضر ${formatNum(snapshot.studentAttendanceSummary.present)} · غائب ${formatNum(snapshot.studentAttendanceSummary.absent)}`}
          />
          <StatCard title="سجلات قرار العميد" value={deanBreakdown.totalReports} hint="صفوف تقارير الموقف في النظام" />
        </div>
      </section>

      <section id="report-branches" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#334155] print:mb-3 print:border-b print:border-[#E2E8F0] print:pb-1.5 print:text-[11pt] print:font-black print:text-[#0F172A]">
              تقرير الأقسام والفروع
            </h2>
            <p className="mt-1 text-xs text-[#64748B]">يُطابق البيانات في صفحة إدارة الأقسام والفروع.</p>
          </div>
          <Link
            href="/dashboard/college/subjects"
            className="text-xs font-bold text-[#1E3A8A] underline-offset-2 hover:underline print:hidden"
          >
            فتح الصفحة ←
          </Link>
        </div>
        {branchRows.length === 0 ? (
          <p className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-[#64748B]">لا توجد أقسام مسجّلة.</p>
        ) : (
          <ReportTable caption="كل قسم/فرع مع أعداد المواد الدراسية وجلسات الامتحان المرتبطة">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-bold text-[#475569]">
                <th className="px-4 py-3">التسمية</th>
                <th className="px-4 py-3">النوع</th>
                <th className="px-4 py-3">رئيس القسم</th>
                <th className="px-4 py-3 tabular-nums">مواد دراسية</th>
                <th className="px-4 py-3 tabular-nums">جلسات جدول</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {branchRows.map((row, i) => (
                <tr key={`${row.branchName}-${i}`} className="text-[#0F172A]">
                  <td className="px-4 py-2.5 font-semibold">{row.branchName}</td>
                  <td className="px-4 py-2.5 text-[#64748B]">{row.branchTypeLabel}</td>
                  <td className="px-4 py-2.5 text-[#64748B]">{row.branchHeadName}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatNum(row.studySubjectsCount)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatNum(row.examSchedulesCount)}</td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
        )}
      </section>

      <section id="report-study" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#334155] print:mb-3 print:border-b print:border-[#E2E8F0] print:pb-1.5 print:text-[11pt] print:font-black print:text-[#0F172A]">
              المواد الدراسية
            </h2>
            <p className="mt-1 text-xs text-[#64748B]">التوزيع حسب نوع الدراسة وجلسات الجدول المرتبطة بكل نوع.</p>
          </div>
          <Link
            href="/dashboard/college/study-subjects"
            className="text-xs font-bold text-[#1E3A8A] underline-offset-2 hover:underline print:hidden"
          >
            فتح الصفحة ←
          </Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="مواد مسجّلة حسب نوع الدراسة" subtitle="عدد سجلات المواد الدراسية لكل نوع">
            {studyBarData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">لا توجد مواد.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={studyBarData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: MUTED }} />
                  <YAxis tick={{ fontSize: 11, fill: MUTED }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, "مواد"]} />
                  <Bar dataKey="count" name="العدد" fill={CHART_PRIMARY} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
          <ChartCard title="جلسات الجدول حسب نوع مادة الامتحان" subtitle="عدد جلسات college_exam_schedules لكل نوع دراسة للمادة">
            {examByTypeBar.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">لا توجد جلسات.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={examByTypeBar} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: MUTED }} />
                  <YAxis tick={{ fontSize: 11, fill: MUTED }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, "جلسات"]} />
                  <Bar dataKey="count" name="جلسات" fill={BLUE_MID} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
        <ReportTable caption="تفصيل أعداد الجلسات الامتحانية حسب نوع الدراسة (من المادة الدراسية المرتبطة بالجدول)">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-bold text-[#475569]">
              <th className="px-4 py-3">نوع الدراسة</th>
              <th className="px-4 py-3 tabular-nums">عدد الجلسات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {schedulesByStudyType.map((row) => (
              <tr key={row.studyType}>
                <td className="px-4 py-2.5 font-medium text-[#0F172A]">{row.label}</td>
                <td className="px-4 py-2.5 tabular-nums text-[#334155]">{formatNum(row.count)}</td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      </section>

      <section id="report-rooms" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#334155] print:mb-3 print:border-b print:border-[#E2E8F0] print:pb-1.5 print:text-[11pt] print:font-black print:text-[#0F172A]">
              تقرير القاعات
            </h2>
            <p className="mt-1 text-xs text-[#64748B]">
              {formatNum(rooms.length)} قاعة · إجمالي سعة (المادة الأولى): {formatNum(roomCapacitySummary.sumCapacityTotal)} ·
              قاعات بامتحان مزدوج: {formatNum(roomCapacitySummary.roomsWithDualExam)}
            </p>
          </div>
          <Link
            href="/dashboard/college/rooms-management"
            className="text-xs font-bold text-[#1E3A8A] underline-offset-2 hover:underline print:hidden"
          >
            فتح الصفحة ←
          </Link>
        </div>
        {rooms.length === 0 ? (
          <p className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-[#64748B]">لا توجد قاعات مسجّلة.</p>
        ) : (
          <div className="statistics-rooms-report-wrap max-h-[480px] overflow-auto rounded-xl border border-[#E2E8F0] shadow-sm print:max-h-none print:overflow-visible print:shadow-none">
            <table className="statistics-rooms-report-table w-full min-w-[720px] border-collapse text-right text-xs print:min-w-0 print:w-full print:table-fixed print:text-[7.5pt]">
              <caption className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-start text-xs font-bold text-[#334155] print:px-2 print:py-2 print:text-[8.5pt]">
                القاعات والمواد والسعة والمشرف (ملخص إداري)
              </caption>
              <thead className="sticky top-0 z-[1] border-b border-[#E2E8F0] bg-[#F1F5F9] font-bold text-[#475569] print:static">
                <tr>
                  <th className="w-[5%] px-2 py-2 print:px-1 print:py-1">ت.</th>
                  <th className="w-[11%] px-2 py-2 print:px-1 print:py-1">القاعة</th>
                  <th className="w-[26%] px-2 py-2 print:px-1 print:py-1">المادة</th>
                  <th className="w-[26%] px-2 py-2 print:px-1 print:py-1">مادة ثانية</th>
                  <th className="w-[10%] px-2 py-2 print:px-1 print:py-1 tabular-nums">سعة إجمالي</th>
                  <th className="w-[22%] px-2 py-2 print:px-1 print:py-1">مشرف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-[#0F172A]">
                {rooms.map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-2 tabular-nums align-top text-[#64748B] print:px-1 print:py-1">
                      {r.serial_no}
                    </td>
                    <td className="break-words px-2 py-2 align-top font-semibold print:px-1 print:py-1">
                      {r.room_name}
                    </td>
                    <td className="break-words px-2 py-2 align-top text-[#475569] print:px-1 print:py-1">
                      {r.study_subject_name}
                    </td>
                    <td className="break-words px-2 py-2 align-top text-[#64748B] print:px-1 print:py-1">
                      {r.study_subject_name_2 ?? "—"}
                    </td>
                    <td className="px-2 py-2 align-top tabular-nums print:px-1 print:py-1">{formatNum(r.capacity_total)}</td>
                    <td className="break-words px-2 py-2 align-top text-[#64748B] print:px-1 print:py-1">
                      {r.supervisor_name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="report-schedules" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#334155] print:mb-3 print:border-b print:border-[#E2E8F0] print:pb-1.5 print:text-[11pt] print:font-black print:text-[#0F172A]">
              الجداول الامتحانية
            </h2>
            <p className="mt-1 text-xs text-[#64748B]">حالة سير العمل، التوزيع حسب القسم، وكثافة الجلسات حسب اليوم.</p>
          </div>
          <Link
            href="/dashboard/college/exam-schedules"
            className="text-xs font-bold text-[#1E3A8A] underline-offset-2 hover:underline print:hidden"
          >
            فتح الصفحة ←
          </Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="حالة سير عمل الجلسات" subtitle="مسودة، مرفوع، معتمد، مرفوض">
            {workflowPieData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">لا توجد جلسات.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={workflowPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={2}
                  >
                    {workflowPieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, "جلسات"]} />
                  <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
          <ChartCard title="الجلسات حسب القسم" subtitle="تكديس حالات سير العمل لكل قسم أو فرع">
            {examStackChartData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">لا توجد جلسات مرتبطة بأقسام.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={examStackChartData} margin={{ top: 8, right: 16, left: 8, bottom: 56 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                  <XAxis
                    dataKey="labelShort"
                    tick={{ fontSize: 10, fill: MUTED }}
                    interval={0}
                    angle={-22}
                    textAnchor="end"
                    height={64}
                  />
                  <YAxis tick={{ fontSize: 11, fill: MUTED }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(_, payload) =>
                      (payload?.[0]?.payload as { branchName?: string } | undefined)?.branchName ?? ""
                    }
                  />
                  <Legend layout="horizontal" verticalAlign="top" align="center" wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="draft" stackId="st" name="مسودة" fill={CHART_SOFT} />
                  <Bar dataKey="submitted" stackId="st" name="مرفوع" fill={BLUE_MID} />
                  <Bar dataKey="approved" stackId="st" name="معتمد" fill={CHART_PRIMARY} />
                  <Bar dataKey="rejected" stackId="st" name="مرفوض" fill="#475569" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
          <ChartCard
            className="lg:col-span-2"
            chartClassName="h-[280px]"
            printChartAreaClass="statistics-print-chart-area--wide"
            title="كثافة الجلسات حسب يوم الامتحان"
            subtitle="عدد الجلسات لكل تاريخ"
          >
            {examDayData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">لا توجد تواريخ في الجدول.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={examDayData} margin={{ top: 8, right: 8, left: 8, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: MUTED }} interval={0} angle={-20} textAnchor="end" height={52} />
                  <YAxis tick={{ fontSize: 11, fill: MUTED }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [value, "جلسات"]}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload as { fullDate?: string } | undefined;
                      return p?.fullDate ? `التاريخ ${p.fullDate}` : "";
                    }}
                  />
                  <Bar dataKey="sessions" fill={CHART_PRIMARY} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
        <ReportTable caption="ملخص الجلسات لكل قسم (مسودة / مرفوع / معتمد / مرفوض)">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-bold text-[#475569]">
              <th className="px-4 py-3">القسم / الفرع</th>
              <th className="px-4 py-3 tabular-nums">الإجمالي</th>
              <th className="px-4 py-3 tabular-nums">مسودة</th>
              <th className="px-4 py-3 tabular-nums">مرفوع</th>
              <th className="px-4 py-3 tabular-nums">معتمد</th>
              <th className="px-4 py-3 tabular-nums">مرفوض</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {snapshot.byBranchExamProgress.map((row) => (
              <tr key={row.branchName}>
                <td className="px-4 py-2.5 font-medium text-[#0F172A]">{row.branchName}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatNum(row.total)}</td>
                <td className="px-4 py-2.5 tabular-nums text-[#64748B]">{formatNum(row.draft)}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatNum(row.submitted)}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatNum(row.approved)}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatNum(row.rejected)}</td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      </section>

      <section id="report-upload" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#334155] print:mb-3 print:border-b print:border-[#E2E8F0] print:pb-1.5 print:text-[11pt] print:font-black print:text-[#0F172A]">
              رفع المواقف الامتحانية
            </h2>
            <p className="mt-1 text-xs text-[#64748B]">ما يخص الجلسات المعتمدة أو المرفوعة للمتابعة — حسب صفحة حالة الرفع.</p>
          </div>
          <Link
            href="/dashboard/college/upload-status"
            className="text-xs font-bold text-[#1E3A8A] underline-offset-2 hover:underline print:hidden"
          >
            فتح الصفحة ←
          </Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="رفع الموقف (جميع جلسات الموقف)" subtitle="مرفوع مقابل غير مرفوع">
            {uploadPieData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">لا بيانات.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={uploadPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={2}
                  >
                    {uploadPieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, "جلسات"]} />
                  <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
          <ChartCard title="اكتمال بيانات الموقف" subtitle="مكتمل / غير مكتمل حسب منطق النظام">
            {completePieData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">لا بيانات.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={completePieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={2}
                  >
                    {completePieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, "جلسات"]} />
                  <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
        <ReportTable caption="ملخص الرفع لكل يوم امتحان (جلسات مرفوعة للمتابعة أو معتمدة فقط)">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-bold text-[#475569]">
              <th className="px-4 py-3">تاريخ الامتحان</th>
              <th className="px-4 py-3 tabular-nums">إجمالي الجلسات</th>
              <th className="px-4 py-3 tabular-nums">بعد تأكيد الرفع</th>
              <th className="px-4 py-3 tabular-nums">المتبقي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {dayUploads.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-[#64748B]">
                  لا توجد جلسات في حالة مرفوع/معتمد، أو لا توجد أيام مجدولة بعد.
                </td>
              </tr>
            ) : (
              dayUploads.map((d) => {
                const rest = Math.max(0, d.total_sessions - d.uploaded_sessions);
                return (
                  <tr key={d.exam_date}>
                    <td className="px-4 py-2.5 font-medium text-[#0F172A]">{d.exam_date}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatNum(d.total_sessions)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatNum(d.uploaded_sessions)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[#64748B]">{formatNum(rest)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </ReportTable>
      </section>

      <section id="report-followup" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#334155] print:mb-3 print:border-b print:border-[#E2E8F0] print:pb-1.5 print:text-[11pt] print:font-black print:text-[#0F172A]">
              متابعة المواقف وقرار العميد
            </h2>
            <p className="mt-1 text-xs text-[#64748B]">تصنيف سجلات تقارير الموقف حسب حالة اعتماد العميد أو المعاون العلمي.</p>
          </div>
          <Link
            href="/dashboard/college/status-followup"
            className="text-xs font-bold text-[#1E3A8A] underline-offset-2 hover:underline print:hidden"
          >
            فتح الصفحة ←
          </Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="توزيع قرارات العميد" subtitle="على جميع صفوف college_exam_situation_reports">
            {deanPieData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">لا توجد تقارير موقف بعد.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deanPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={2}
                  >
                    {deanPieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, "سجلات"]} />
                  <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
          <ChartCard
            chartClassName="min-h-[200px] h-auto"
            printChartAreaClass="statistics-print-chart-area--tall"
            title="الخط الزمني للجلسات حسب القسم"
            subtitle="أكثر الأقسام نشاطاً — نفس منطق لوحة التحكم الرئيسية"
          >
            {snapshot.branchTimeline.chartData.length === 0 || snapshot.branchTimeline.lines.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#64748B]">لا توجد بيانات كافية للخط الزمني.</p>
            ) : (
              <div className="statistics-print-chart-inner h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={snapshot.branchTimeline.chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: MUTED }}
                      tickFormatter={(d) => (typeof d === "string" ? formatExamDateShort(d) : String(d))}
                    />
                    <YAxis tick={{ fontSize: 11, fill: MUTED }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => [value, "جلسات"]}
                      labelFormatter={(d) => (typeof d === "string" ? `التاريخ ${d}` : String(d))}
                    />
                    <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: 9 }} />
                    {snapshot.branchTimeline.lines.map((line, idx) => (
                      <Line
                        key={line.dataKey}
                        type="monotone"
                        dataKey={line.dataKey}
                        name={line.label}
                        stroke={TIMELINE_STROKES[idx % TIMELINE_STROKES.length]}
                        strokeWidth={2}
                        dot={{ r: 2, strokeWidth: 1, fill: "#fff" }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>
        <ReportTable caption="أرقام قرار العميد (مجمّعة)">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-bold text-[#475569]">
              <th className="px-4 py-3">البند</th>
              <th className="px-4 py-3 tabular-nums">العدد</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            <tr>
              <td className="px-4 py-2.5 font-medium text-[#0F172A]">إجمالي سجلات التقرير</td>
              <td className="px-4 py-2.5 tabular-nums">{formatNum(deanBreakdown.totalReports)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-[#334155]">معتمد</td>
              <td className="px-4 py-2.5 tabular-nums">{formatNum(deanBreakdown.approved)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-[#334155]">مرفوض</td>
              <td className="px-4 py-2.5 tabular-nums">{formatNum(deanBreakdown.rejected)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-[#334155]">قيد المراجعة (معلّق)</td>
              <td className="px-4 py-2.5 tabular-nums">{formatNum(deanBreakdown.pending)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-[#334155]">دون قرار / مسودة</td>
              <td className="px-4 py-2.5 tabular-nums">{formatNum(deanBreakdown.none)}</td>
            </tr>
          </tbody>
        </ReportTable>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm print:hidden">
          <h3 className="text-base font-bold text-[#0F172A]">آخر العمليات</h3>
          <p className="mt-1 text-xs text-[#64748B]">أحدث تحديثات للمواقف والجداول (كما في لوحة التحكم).</p>
          {snapshot.recentActivities.length === 0 ? (
            <p className="mt-6 text-center text-sm text-[#64748B]">لا توجد عمليات مسجّلة.</p>
          ) : (
            <ul className="mt-4 max-h-[320px] space-y-0 overflow-y-auto rounded-xl border border-[#F1F5F9] divide-y divide-[#F1F5F9]">
              {snapshot.recentActivities.map((item, idx) => (
                <li key={`${item.occurredAt}-${idx}`} className="flex flex-col gap-1 px-4 py-3 text-right">
                  <span className="text-[11px] font-mono tabular-nums text-[#94A3B8]">
                    {formatGeneratedAt(item.occurredAt)}
                  </span>
                  <span className="text-sm font-bold text-[#0F172A]">{item.title}</span>
                  <span className="text-xs text-[#64748B]">{item.description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="cross-chart-heading">
        <h2
          id="cross-chart-heading"
          className="text-sm font-bold text-[#334155] print:mb-3 print:border-b print:border-[#E2E8F0] print:pb-1.5 print:text-[11pt] print:font-black print:text-[#0F172A]"
        >
          مواد الأقسام (عرض مركّب)
        </h2>
        <ChartCard
          chartClassName="min-h-[280px] h-[300px]"
          printChartAreaClass="statistics-print-chart-area--tall"
          title="عدد المواد الدراسية لكل قسم أو فرع"
          subtitle="مرتبط بصفحة الأقسام والمواد"
        >
          {branchSubjectChartData.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-[#64748B]">لا توجد أقسام بعد.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={branchSubjectChartData}
                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} horizontal vertical={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: MUTED }} allowDecimals={false} />
                <YAxis type="category" dataKey="labelShort" width={112} tick={{ fontSize: 10, fill: "#475569" }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [value, "مواد دراسية"]}
                  labelFormatter={(_, payload) =>
                    (payload?.[0]?.payload as { branchName?: string } | undefined)?.branchName ?? ""
                  }
                />
                <Bar dataKey="studySubjectCount" name="المواد" fill={CHART_PRIMARY} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </section>

      <footer className="mt-12 hidden border-t-2 border-[#1E3A8A] pt-5 text-center print:block">
        <p className="text-[10pt] font-bold text-[#334155]">— نهاية التقرير —</p>
        <p className="mt-2 text-[8.5pt] leading-relaxed text-[#64748B]">
          وثيقة مُولَّدة إلكترونياً من نظام رصين لإدارة الامتحانات. صيغة الطباعة الموصى بها: ورق A4 عمودي، مع حواف
          آمنة للطابعة.
        </p>
      </footer>
    </div>
  );
}
