"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { CollegeProfileRow } from "@/lib/college-accounts";
import { DASHBOARD_TIMELINE_MAX_BRANCHES } from "@/lib/college-dashboard-constants";
import type { CollegeDashboardSnapshot } from "@/lib/college-dashboard-stats";
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

const CHART_BLUE = ["#1e3a8a", "#2563eb", "#3b82f6", "#0ea5e9", "#6366f1"];

const MAX_EXAM_DAYS_ON_CHART = 28;

type DashboardInsight = {
  tone: "info" | "warn" | "success";
  text: string;
  action?: { href: string; label: string };
};

function InsightIcon({ tone }: { tone: DashboardInsight["tone"] }) {
  const cls = "size-[18px] shrink-0 opacity-90";
  if (tone === "warn") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
        />
      </svg>
    );
  }
  if (tone === "success") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    );
  }
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
      />
    </svg>
  );
}

function formatNum(n: number): string {
  try {
    return n.toLocaleString("en-US");
  } catch {
    return String(n);
  }
}

function formatActivityWhen(iso: string): string {
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

function formatExamDateShort(iso: string): string {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    return `${d}/${m}`;
  } catch {
    return iso;
  }
}

function StatCard({
  title,
  value,
  hint,
  accent,
}: {
  title: string;
  value: string | number;
  hint?: string;
  accent?: "slate" | "blue" | "emerald" | "amber";
}) {
  const bar =
    accent === "emerald"
      ? "from-emerald-500/90 to-emerald-700"
      : accent === "amber"
        ? "from-amber-500/90 to-amber-700"
        : accent === "blue"
          ? "from-blue-600 to-indigo-800"
          : "from-slate-600 to-slate-800";
  return (
    <div className="relative flex h-[100px] flex-col justify-between overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-sm xl:h-[104px] xl:p-3.5">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l ${bar}`}
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
          className="min-w-0 truncate text-[10px] leading-tight text-[#94A3B8] xl:text-[11px]"
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
  chartClassName = "h-[280px]",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** غلاف إضافي، مثل lg:col-span-2 */
  className?: string;
  /** ارتفاع منطقة الرسم، يُفضَّل أكبر للبطاقات العريضة */
  chartClassName?: string;
}) {
  return (
    <div className={`rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm ${className ?? ""}`}>
      <h3 className="text-base font-bold text-[#0F172A]">{title}</h3>
      {subtitle ? <p className="mt-1 text-xs text-[#64748B]">{subtitle}</p> : null}
      <div className={`mt-4 w-full min-w-0 ${chartClassName}`}>{children}</div>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 12,
};

export function CollegeDashboardOverview({
  profile,
  snapshot,
  collegeLabel,
}: {
  profile: CollegeProfileRow | null;
  snapshot: CollegeDashboardSnapshot;
  collegeLabel: string;
}) {
  const isFollowup = profile?.account_kind === "FOLLOWUP";
  const deanOrHolder = isFollowup ? (profile?.holder_name ?? "").trim() : (profile?.dean_name ?? "").trim();

  const workflowData = [
    { name: "مسودة", value: snapshot.schedules.draft, color: "#94a3b8" },
    { name: "مرفوع للمتابعة", value: snapshot.schedules.submitted, color: "#38bdf8" },
    { name: "معتمد", value: snapshot.schedules.approved, color: "#10b981" },
    { name: "مرفوض", value: snapshot.schedules.rejected, color: "#f43f5e" },
  ].filter((d) => d.value > 0);

  const uploadData = [
    { name: "مرفوع", value: snapshot.situations.uploaded, color: "#2563eb" },
    { name: "غير مرفوع", value: snapshot.situations.notUploaded, color: "#cbd5e1" },
  ].filter((d) => d.value > 0);

  const completeData = [
    { name: "مكتمل", value: snapshot.situations.complete, color: "#059669" },
    { name: "غير مكتمل", value: snapshot.situations.incomplete, color: "#e2e8f0" },
  ].filter((d) => d.value > 0);

  const studyBarData = snapshot.studySubjects.byType
    .filter((x) => x.count > 0)
    .map((x) => ({ name: x.label, count: x.count }));

  const examDayDataFull = snapshot.examDays.byDate.map((x) => ({
    name: formatExamDateShort(x.date),
    sessions: x.sessions,
    fullDate: x.date,
  }));
  const examDayTruncated = examDayDataFull.length > MAX_EXAM_DAYS_ON_CHART;
  const examDayData = examDayTruncated
    ? examDayDataFull.slice(-MAX_EXAM_DAYS_ON_CHART)
    : examDayDataFull;

  const dashboardInsights: DashboardInsight[] = [];
  if (snapshot.branches.total === 0 && snapshot.studySubjects.total === 0) {
    dashboardInsights.push({
      tone: "info",
      text: "ابدأ بإضافة الأقسام والمواد؛ ثم الجداول والمواقف تتكوّن تلقائياً.",
      action: { href: "/dashboard/college/subjects", label: "الأقسام" },
    });
  } else if (snapshot.schedules.total === 0 && snapshot.studySubjects.total > 0) {
    dashboardInsights.push({
      tone: "info",
      text: "المواد جاهزة — جدّولوا الجلسات بعد ضبط القاعات.",
      action: { href: "/dashboard/college/exam-schedules", label: "الجداول" },
    });
  }
  if (snapshot.schedules.total > 0 && snapshot.schedules.draft > 0) {
    dashboardInsights.push({
      tone: "warn",
      text: `${formatNum(snapshot.schedules.draft)} جلسة مسوّدة — أرسلوا للمتابعة أو الاعتماد.`,
      action: { href: "/dashboard/college/exam-schedules", label: "مراجعة" },
    });
  }
  if (snapshot.situations.totalRows > 0 && snapshot.situations.notUploaded > 0) {
    dashboardInsights.push({
      tone: "warn",
      text: `${formatNum(snapshot.situations.notUploaded)} جلسة بلا رفع موقف — خلال نافذة الامتحان.`,
      action: { href: "/dashboard/college/upload-status", label: "رفع الموقف" },
    });
  }
  if (snapshot.situations.totalRows > 0 && snapshot.situations.uploaded === snapshot.situations.totalRows) {
    dashboardInsights.push({
      tone: "success",
      text: "كل المواقف مرفوعة — تابعوا اعتماد العميد.",
      action: { href: "/dashboard/college/status-followup", label: "المتابعة" },
    });
  }

  const branchHint =
    snapshot.branches.total === 0
      ? "أضف أقساماً أو فروعاً من القائمة الجانبية"
      : `${formatNum(snapshot.branches.departments)} قسم · ${formatNum(snapshot.branches.branchFaculties)} فرع`;

  const typesInUse = snapshot.studySubjects.byType.filter((x) => x.count > 0).length;

  const branchSubjectChartData = snapshot.byBranchSubjects.map((r) => ({
    ...r,
    labelShort: r.branchName.length > 26 ? `${r.branchName.slice(0, 24)}…` : r.branchName,
  }));

  const examStackData = snapshot.byBranchExamProgress.map((r) => ({
    ...r,
    labelShort: r.branchName.length > 16 ? `${r.branchName.slice(0, 14)}…` : r.branchName,
  }));
  const examStackChartData = examStackData.filter((r) => r.total > 0);
  const hasExamBreakdown = examStackChartData.length > 0;

  return (
    <div className="space-y-8" dir="rtl">
      <header className="relative min-h-[96px] overflow-hidden rounded-2xl border border-[#E8EEF7] bg-white px-5 py-3.5 shadow-[0_6px_20px_rgba(15,23,42,0.05)]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-[#1E3A8A] via-[#2563EB] to-[#38BDF8]"
          aria-hidden
        />
        <p className="text-[11px] font-bold tracking-wide text-[#2563EB]">لوحة تحكم التشكيل</p>
        <h1 className="mt-1 text-xl font-bold leading-tight text-[#0F172A] md:text-2xl">
          {isFollowup ? (
            <>
              أهلًا وسهلًا، <span className="text-[#1E3A8A]">{deanOrHolder || "صاحب حساب المتابعة"}</span>
            </>
          ) : (
            <>
              أهلًا وسهلًا معالي عميد الكلية{" "}
              <span className="text-[#1E3A8A]">{deanOrHolder || "—"}</span>
            </>
          )}
        </h1>
        <p className="mt-1.5 max-w-[42rem] text-xs leading-snug text-[#64748B] md:text-[13px]">
          ملخص <strong className="font-semibold text-[#475569]">{collegeLabel}</strong>: الأقسام، المواد، القاعات،
          الجداول، والمواقف الامتحانية.
        </p>
      </header>

      {dashboardInsights.length > 0 ? (
        <aside className="space-y-1.5" aria-label="تنبيهات لوحة التحكم">
          {dashboardInsights.slice(0, 3).map((insight, i) => {
            const bar =
              insight.tone === "warn"
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : insight.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                  : "border-sky-200 bg-sky-50 text-sky-950";
            return (
              <div
                key={`${insight.tone}-${i}`}
                role="status"
                className={`flex min-h-[44px] items-center gap-2.5 rounded-xl border px-2.5 py-1.5 sm:px-3 sm:py-2 ${bar}`}
              >
                <InsightIcon tone={insight.tone} />
                <p className="min-w-0 flex-1 text-xs font-semibold leading-snug sm:text-[13px] line-clamp-2">
                  {insight.text}
                </p>
                {insight.action ? (
                  <Link
                    href={insight.action.href}
                    className="shrink-0 rounded-lg border border-current/15 bg-white/60 px-2 py-1 text-[11px] font-bold text-inherit shadow-sm transition hover:bg-white/90"
                  >
                    {insight.action.label}
                  </Link>
                ) : null}
              </div>
            );
          })}
        </aside>
      ) : null}

      <section aria-labelledby="kpis-heading">
        <h2 id="kpis-heading" className="mb-4 text-sm font-bold text-[#334155]">
          مؤشرات سريعة
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="الأقسام والفروع" value={snapshot.branches.total} hint={branchHint} accent="slate" />
          <StatCard
            title="المواد الدراسية"
            value={snapshot.studySubjects.total}
            hint={
              typesInUse === 0
                ? "لم تُسجّل مواد بعد"
                : `${formatNum(typesInUse)} نوع/أنواع دراسة مستخدمة في التشكيل`
            }
            accent="blue"
          />
          <StatCard title="قاعات الامتحان" value={snapshot.rooms.total} hint="محجوزة ضمن التشكيل" accent="slate" />
          <StatCard
            title="المشرفون (بدون تكرار)"
            value={snapshot.people.uniqueSupervisors}
            hint="أسماء فريدة من إعداد القاعات"
            accent="emerald"
          />
          <StatCard
            title="المراقبون (بدون تكرار)"
            value={snapshot.people.uniqueInvigilators}
            hint="مستخرج من قوائم القاعات، دون احتساب تكرار الاسم"
            accent="amber"
          />
          <StatCard
            title="الجداول الامتحانية"
            value={snapshot.schedules.total}
            hint={`مسودة ${formatNum(snapshot.schedules.draft)} · مرفوع ${formatNum(snapshot.schedules.submitted)} · معتمد ${formatNum(snapshot.schedules.approved)}`}
            accent="blue"
          />
          <StatCard
            title="أيام إجراء الامتحان"
            value={snapshot.examDays.distinctDates}
            hint={
              snapshot.schedules.total === 0
                ? "تظهر بعد إضافة جلسات في الجدول"
                : `موزّعة على ${snapshot.examDays.distinctDates} يومًا مميزًا`
            }
            accent="slate"
          />
          <StatCard
            title="جلسات الموقف الامتحاني"
            value={snapshot.situations.totalRows}
            hint={`مرفوع ${formatNum(snapshot.situations.uploaded)} · غير مرفوع ${formatNum(snapshot.situations.notUploaded)} · مكتمل ${formatNum(snapshot.situations.complete)}`}
            accent="emerald"
          />
        </div>
      </section>

      <section aria-labelledby="attendance-activity-heading">
        <h2 id="attendance-activity-heading" className="mb-4 text-sm font-bold text-[#334155]">
          حالات الطلاب وآخر العمليات
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
          <div
            className="pointer-events-none mb-4 h-1 rounded-full bg-gradient-to-l from-emerald-500 to-[#1E3A8A]"
            aria-hidden
          />
          <h3 className="text-base font-bold text-[#0F172A]">حالات الطلبة في الجلسات</h3>
          <p className="mt-1 text-xs leading-relaxed text-[#64748B]">
            إجمالي عدد الطلبة المسجّلين كـ <strong className="font-semibold text-[#475569]">حاضر</strong> أو{" "}
            <strong className="font-semibold text-[#475569]">غائب</strong> عبر جلسات الجدول (بيانات القاعات
            المرتبطة بكل امتحان).
          </p>
          <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <dl className="grid flex-1 grid-cols-3 gap-3 text-center sm:text-right">
              <div className="rounded-xl bg-[#F8FAFC] px-3 py-3 ring-1 ring-[#E2E8F0]">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#64748B]">الكل</dt>
                <dd className="mt-1 text-xl font-extrabold tabular-nums text-[#0F172A]">
                  {formatNum(snapshot.studentAttendanceSummary.total)}
                </dd>
              </div>
              <div className="rounded-xl bg-emerald-50/80 px-3 py-3 ring-1 ring-emerald-100">
                <dt className="text-[10px] font-bold text-emerald-800">الحضور</dt>
                <dd className="mt-1 text-xl font-extrabold tabular-nums text-emerald-900">
                  {formatNum(snapshot.studentAttendanceSummary.present)}
                </dd>
              </div>
              <div className="rounded-xl bg-rose-50/80 px-3 py-3 ring-1 ring-rose-100">
                <dt className="text-[10px] font-bold text-rose-800">الغياب</dt>
                <dd className="mt-1 text-xl font-extrabold tabular-nums text-rose-900">
                  {formatNum(snapshot.studentAttendanceSummary.absent)}
                </dd>
              </div>
            </dl>
            {snapshot.studentAttendanceSummary.total > 0 ? (
              <div className="mx-auto h-[140px] w-[140px] shrink-0 sm:mx-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "حاضر", value: snapshot.studentAttendanceSummary.present, color: "#10b981" },
                        { name: "غائب", value: snapshot.studentAttendanceSummary.absent, color: "#f43f5e" },
                      ].filter((d) => d.value > 0)}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={2}
                    >
                      {[
                        { name: "حاضر", value: snapshot.studentAttendanceSummary.present, color: "#10b981" },
                        { name: "غائب", value: snapshot.studentAttendanceSummary.absent, color: "#f43f5e" },
                      ]
                        .filter((d) => d.value > 0)
                        .map((entry) => (
                          <Cell key={entry.name} fill={entry.color} stroke="none" />
                        ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, "طالب"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </div>
          {snapshot.studentAttendanceSummary.total === 0 ? (
            <p className="mt-4 text-xs text-[#94A3B8]">
              لا توجد أعداد حضور/غياب مسجّلة بعد. تظهر البيانات بعد إدخالها في صفحات القاعات والموقف الامتحاني.
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
          <div
            className="pointer-events-none mb-4 h-1 rounded-full bg-gradient-to-l from-sky-500 to-indigo-700"
            aria-hidden
          />
          <h3 className="text-base font-bold text-[#0F172A]">آخر العمليات</h3>
          <p className="mt-1 text-xs text-[#64748B]">
            أحدث تحديثات للمواقف الامتحانية وحالات الجداول، مرتبة زمنياً (توقيت بغداد).
          </p>
          {snapshot.recentActivities.length === 0 ? (
            <p className="mt-8 text-center text-sm text-[#64748B]">لا توجد عمليات مسجّلة بعد.</p>
          ) : (
            <ul className="mt-4 max-h-[340px] space-y-0 overflow-y-auto rounded-xl border border-[#F1F5F9] divide-y divide-[#F1F5F9]">
              {snapshot.recentActivities.map((item, idx) => (
                <li key={`${item.occurredAt}-${idx}`} className="flex flex-col gap-1 px-4 py-3 text-right">
                  <span className="text-[11px] font-mono tabular-nums text-[#94A3B8]">
                    {formatActivityWhen(item.occurredAt)}
                  </span>
                  <span className="text-sm font-bold text-[#0F172A]">{item.title}</span>
                  <span className="text-xs text-[#64748B]">{item.description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="charts-heading">
        <h2 id="charts-heading" className="text-sm font-bold text-[#334155]">
          الرسوم البيانية
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard
            chartClassName="min-h-[260px] h-[280px] lg:h-[300px]"
            title="المواد الدراسية حسب القسم أو الفرع"
            subtitle="عدد المواد الدراسية المسجّلة لكل تشكيل فرعي (قسم أو فرع)"
          >
            {branchSubjectChartData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">
                لا توجد أقسام أو فروع بعد. أضفها من «الأقسام والفروع».
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={branchSubjectChartData}
                  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="labelShort"
                    width={112}
                    tick={{ fontSize: 10, fill: "#475569" }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [value, "مواد دراسية"]}
                    labelFormatter={(_, payload) =>
                      (payload?.[0]?.payload as { branchName?: string } | undefined)?.branchName ?? ""
                    }
                  />
                  <Bar dataKey="studySubjectCount" name="عدد المواد" fill="#1e40af" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard
            chartClassName="min-h-[260px] h-[280px] lg:h-[300px]"
            title="الجداول الامتحانية حسب القسم"
            subtitle="ما أنجز من جلسات لكل قسم: مسودة، مرفوع للمتابعة، معتمد، مرفوض — يعكس حالة سير العمل الحالية"
          >
            {!hasExamBreakdown ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">
                لا توجد جلسات امتحانية مرتبطة بالأقسام بعد.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={examStackChartData} margin={{ top: 8, right: 16, left: 8, bottom: 56 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="labelShort"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(_, payload) =>
                      (payload?.[0]?.payload as { branchName?: string } | undefined)?.branchName ?? ""
                    }
                  />
                  <Legend layout="horizontal" verticalAlign="top" align="center" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="draft" stackId="st" name="مسودة" fill="#94a3b8" />
                  <Bar dataKey="submitted" stackId="st" name="مرفوع للمتابعة" fill="#38bdf8" />
                  <Bar dataKey="approved" stackId="st" name="معتمد" fill="#10b981" />
                  <Bar dataKey="rejected" stackId="st" name="مرفوض" fill="#f43f5e" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard
            className="lg:col-span-2"
            chartClassName="h-[300px] lg:h-[320px]"
            title="تطور الجلسات عبر زمن الامتحانات"
            subtitle={`يوم امتحان على المحور الأفقي؛ لكل قسم خط يوضح عدد الجلسات ذلك اليوم. يُعرض حتى ${DASHBOARD_TIMELINE_MAX_BRANCHES} أقسام الأكثر نشاطاً (حسب مجموع الجلسات) لقراءة أوضح.`}
          >
            {snapshot.branchTimeline.chartData.length === 0 || snapshot.branchTimeline.lines.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">
                لا توجد جلسات كافية لرسم الخط الزمني حسب القسم.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={snapshot.branchTimeline.chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    tickFormatter={(d) => (typeof d === "string" ? formatExamDateShort(d) : String(d))}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [value, "جلسات"]}
                    labelFormatter={(d) => (typeof d === "string" ? `التاريخ ${d}` : String(d))}
                  />
                  <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: 10 }} />
                  {snapshot.branchTimeline.lines.map((line) => (
                    <Line
                      key={line.dataKey}
                      type="monotone"
                      dataKey={line.dataKey}
                      name={line.label}
                      stroke={line.color}
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 1, fill: "#fff" }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="حالة الجداول الامتحانية" subtitle="توزيع الجلسات المجدولة حسب مسار الاعتماد">
            {workflowData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">لا توجد جداول بعد.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={workflowData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {workflowData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, "الجلسات"]} />
                  <Legend layout="horizontal" verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="رفع المواقف الامتحانية" subtitle="جلسات الجدول: مرفوع الموقف من عدمه">
            {uploadData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">لا توجد جلسات بعد.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={uploadData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {uploadData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, "الجلسات"]} />
                  <Legend layout="horizontal" verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="اكتمال بيانات الموقف" subtitle="مكتمل حسب اعتماد العميد أو اكتمال الحضور والغياب">
            {completeData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">لا توجد جلسات بعد.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={completeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {completeData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, "الجلسات"]} />
                  <Legend layout="horizontal" verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard
            title="المواد الدراسية حسب نوع الدراسة"
            subtitle="سنوي، فصلي، مقررات، بولونيا — عدد المواد المسجّلة لكل نوع"
          >
            {studyBarData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">لا توجد مواد دراسية بعد.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={studyBarData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, "عدد المواد"]} />
                  <Bar dataKey="count" name="عدد المواد" radius={[6, 6, 0, 0]}>
                    {studyBarData.map((_, i) => (
                      <Cell key={i} fill={CHART_BLUE[i % CHART_BLUE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard
            className="lg:col-span-2"
            chartClassName="h-[280px] lg:h-[300px]"
            title="كثافة الجلسات حسب اليوم"
            subtitle={
              examDayTruncated
                ? `آخر ${formatNum(MAX_EXAM_DAYS_ON_CHART)} يومًا في الجدول — عدد الجلسات لكل تاريخ (التلميح يعرض التاريخ الكامل)`
                : "عدد الجلسات الامتحانية لكل تاريخ (يظهر تاريخ الامتحان في التلميح)"
            }
          >
            {examDayData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">لا توجد تواريخ بعد.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={examDayData} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} angle={-22} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [value, "جلسات"]}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload as { fullDate?: string } | undefined;
                      return p?.fullDate ? `التاريخ ${p.fullDate}` : "";
                    }}
                  />
                  <Bar dataKey="sessions" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </section>
    </div>
  );
}
