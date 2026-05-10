 "use client";

import { useMemo, useState } from "react";
import type { AdminOfficialSituationFollowupRow } from "@/lib/college-exam-situations";
import { formatCollegeStudyStageLabel } from "@/lib/college-study-stage-display";

function formatNum(n: number): string {
  try {
    return new Intl.NumberFormat("en-US").format(n);
  } catch {
    return String(n);
  }
}

function formatExamDateAr(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory-nu-latn", {
      dateStyle: "full",
      timeZone: "Asia/Baghdad",
    }).format(new Date(`${isoDate}T12:00:00`));
  } catch {
    return isoDate;
  }
}

function formatSubmittedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory-nu-latn", {
      timeZone: "Asia/Baghdad",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function buildGroups(rows: AdminOfficialSituationFollowupRow[]) {
  const byDate = new Map<string, Map<string, AdminOfficialSituationFollowupRow[]>>();
  for (const row of rows) {
    const d = row.exam_date.trim() || "—";
    if (!byDate.has(d)) byDate.set(d, new Map());
    const inner = byDate.get(d)!;
    const f = row.formation_label.trim() || "—";
    if (!inner.has(f)) inner.set(f, []);
    inner.get(f)!.push(row);
  }
  const dates = [...byDate.keys()].filter((x) => x !== "—").sort((a, b) => b.localeCompare(a));
  if (byDate.has("—")) dates.push("—");
  return { byDate, dates };
}

function computeStats(rows: AdminOfficialSituationFollowupRow[]) {
  const formationSet = new Set<string>();
  const daySet = new Set<string>();
  let deptApproved = 0;
  let deptNotApproved = 0;
  let deanAuthenticated = 0;
  let deanNotAuthenticated = 0;
  for (const r of rows) {
    formationSet.add(r.formation_label);
    daySet.add(r.exam_date);
    if (r.dean_status === "APPROVED") deptApproved++;
    else deptNotApproved++;
    if (r.is_uploaded) deanAuthenticated++;
    else deanNotAuthenticated++;
  }
  return {
    totalRows: rows.length,
    distinctFormations: formationSet.size,
    distinctExamDays: daySet.size,
    deptApproved,
    deptNotApproved,
    deanAuthenticated,
    deanNotAuthenticated,
  };
}

function deptApprovalLabel(s: AdminOfficialSituationFollowupRow["dean_status"]): string {
  if (s === "APPROVED") return "معتمد من رئيس القسم/الفرع";
  if (s === "REJECTED") return "مرفوض من رئيس القسم/الفرع";
  if (s === "PENDING") return "قيد مراجعة رئيس القسم/الفرع";
  return "غير معتمد من رئيس القسم/الفرع";
}

function deanAuthLabel(uploaded: boolean): string {
  return uploaded ? "مصادق من حساب العميد" : "غير مصادق من حساب العميد";
}

function toAnchorSlug(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\u0600-\u06FF\w-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formationDayAnchorId(examDate: string, formationLabel: string): string {
  const d = toAnchorSlug(examDate) || "day";
  const f = toAnchorSlug(formationLabel) || "formation";
  return `goto-${d}-${f}`;
}

type NavigatorBranchNode = {
  branchName: string;
  examDates: string[];
};

type NavigatorFormationNode = {
  ownerUserId: string;
  formationLabel: string;
  totalRows: number;
  examDates: string[];
  branches: NavigatorBranchNode[];
};

function buildNavigator(rows: AdminOfficialSituationFollowupRow[]): NavigatorFormationNode[] {
  const byFormation = new Map<
    string,
    { ownerUserId: string; totalRows: number; examDates: Set<string>; byBranch: Map<string, Set<string>> }
  >();
  for (const r of rows) {
    const formation = r.formation_label.trim() || "—";
    const branch = r.branch_name.trim() || "—";
    const day = r.exam_date.trim() || "—";
    if (!byFormation.has(formation)) {
      byFormation.set(formation, {
        ownerUserId: r.owner_user_id,
        totalRows: 0,
        examDates: new Set<string>(),
        byBranch: new Map(),
      });
    }
    const f = byFormation.get(formation)!;
    f.totalRows += 1;
    f.examDates.add(day);
    if (!f.byBranch.has(branch)) f.byBranch.set(branch, new Set());
    f.byBranch.get(branch)!.add(day);
  }
  return [...byFormation.entries()]
    .map(([formationLabel, info]) => ({
      ownerUserId: info.ownerUserId,
      formationLabel,
      totalRows: info.totalRows,
      examDates: [...info.examDates].filter((d) => d !== "—").sort((a, b) => b.localeCompare(a)),
      branches: [...info.byBranch.entries()]
        .map(([branchName, days]) => ({
          branchName,
          examDates: [...days].filter((d) => d !== "—").sort((a, b) => b.localeCompare(a)),
        }))
        .sort((a, b) => a.branchName.localeCompare(b.branchName, "ar")),
    }))
    .sort((a, b) => a.formationLabel.localeCompare(b.formationLabel, "ar"));
}

export function AdminSituationsFollowupView({
  rows: allRows,
  availableExamDates,
  defaultExamDate,
  queryText = "",
}: {
  rows: AdminOfficialSituationFollowupRow[];
  availableExamDates: string[];
  defaultExamDate: string;
  queryText?: string;
}) {
  const [deanAuthFilter, setDeanAuthFilter] = useState<"ALL" | "AUTHED" | "NOT_AUTHED">("ALL");
  const [deptApprovalFilter, setDeptApprovalFilter] = useState<"ALL" | "APPROVED" | "NOT_APPROVED">("ALL");
  const rows = useMemo(
    () =>
      allRows.filter((r) => {
        if (deanAuthFilter === "AUTHED" && !r.is_uploaded) return false;
        if (deanAuthFilter === "NOT_AUTHED" && r.is_uploaded) return false;
        if (deptApprovalFilter === "APPROVED" && r.dean_status !== "APPROVED") return false;
        if (deptApprovalFilter === "NOT_APPROVED" && r.dean_status === "APPROVED") return false;
        return true;
      }),
    [allRows, deanAuthFilter, deptApprovalFilter]
  );
  const stats = computeStats(rows);
  const { byDate, dates } = buildGroups(rows);
  const navigator = buildNavigator(rows);

  return (
    <div id="top" className="mx-auto max-w-6xl space-y-8 px-4 py-6" dir="rtl">
      <header className="relative overflow-hidden rounded-2xl border border-[#E8EEF7] bg-white px-5 py-4 shadow-sm">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#1E3A8A] via-[#2563EB] to-[#38BDF8]"
          aria-hidden
        />
        <h1 className="text-2xl font-extrabold text-[#0F172A]">متابعة المواقف الامتحانية</h1>
        <p className="mt-1 text-sm text-[#64748B]">
          كل المواقف الرسمية من صفحة «رفع الموقف الامتحاني» في حسابات الأقسام والفروع، مجمّعة حسب{" "}
          <strong className="font-semibold text-[#475569]">يوم الامتحان</strong> ثم{" "}
          <strong className="font-semibold text-[#475569]">التشكيل</strong>.
        </p>
        <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[260px] flex-col gap-1 text-xs font-bold text-[#334155]">
            شريط البحث
            <input
              name="q"
              defaultValue={queryText}
              placeholder="ابحث بالتشكيل أو القسم/الفرع أو المادة أو اليوم..."
              className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#BFDBFE]"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-lg border border-[#1E3A8A] bg-[#1E3A8A] px-3 text-sm font-bold text-white transition hover:bg-[#163170]"
          >
            بحث
          </button>
          {queryText.trim().length > 0 ? (
            <a
              href="/dashboard/situations-followup"
              className="inline-flex h-10 items-center rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm font-bold text-[#475569] transition hover:bg-[#F8FAFC]"
            >
              مسح البحث
            </a>
          ) : null}
        </form>
      </header>

      <section aria-label="إحصائيات موجزة" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="مواقف مسجّلة" value={formatNum(stats.totalRows)} hint="إجمالي الجلسات" accent="blue" />
        <StatCard title="تشكيلات شاركت" value={formatNum(stats.distinctFormations)} hint="حسابات مالكة" accent="slate" />
        <StatCard title="أيام امتحان" value={formatNum(stats.distinctExamDays)} hint="تواريخ مميّزة" accent="slate" />
        <StatCard title="معتمد من رئيس القسم/الفرع" value={formatNum(stats.deptApproved)} hint="حالة الاعتماد الداخلي" accent="emerald" />
        <StatCard title="غير معتمد من رئيس القسم/الفرع" value={formatNum(stats.deptNotApproved)} hint="تحتاج اعتماد رئيس القسم/الفرع" accent="amber" />
        <StatCard title="مصادق من حساب العميد" value={formatNum(stats.deanAuthenticated)} hint="تم تأكيد رفع الموقف" accent="blue" />
        <StatCard title="غير مصادق من حساب العميد" value={formatNum(stats.deanNotAuthenticated)} hint="لم يتم تأكيد الرفع بعد" accent="slate" />
      </section>

      {navigator.length > 0 ? (
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm" aria-label="التنقل الذكي حسب التشكيل">
          <h2 className="text-base font-extrabold text-[#0F172A]">التنقل الذكي حسب التشكيل / القسم / اليوم</h2>
          <p className="mt-1 text-xs text-[#64748B]">
            افتح التشكيل، ثم اختر القسم/الفرع واليوم الامتحاني للانتقال مباشرة إلى السجلات المطابقة داخل الصفحة.
          </p>
          <div className="mt-3 space-y-2">
            {navigator.map((formation) => (
              <details key={formation.formationLabel} className="rounded-xl border border-[#E2E8F0] bg-[#FAFBFC]">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-bold text-[#1E3A8A]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      {formation.formationLabel}
                      <span className="mr-2 text-[11px] font-semibold text-[#64748B]">
                        ({formatNum(formation.totalRows)} موقفاً · {formatNum(formation.branches.length)} قسم/فرع)
                      </span>
                    </div>
                    <form
                      method="get"
                      action="/dashboard/situations-followup/custom-report"
                      target="_blank"
                      className="flex items-center gap-1"
                    >
                      <input type="hidden" name="ownerUserId" value={formation.ownerUserId} />
                      <select
                        name="examDate"
                        defaultValue={formation.examDates[0] ?? defaultExamDate}
                        className="h-7 rounded-md border border-[#CBD5E1] bg-white px-2 text-[11px] font-semibold text-[#334155]"
                      >
                        {formation.examDates.length > 0
                          ? formation.examDates.map((d) => (
                              <option key={`${formation.formationLabel}-${d}`} value={d}>
                                {d}
                              </option>
                            ))
                          : (
                              <option value={defaultExamDate}>{defaultExamDate}</option>
                            )}
                      </select>
                      <button
                        type="submit"
                        className="inline-flex h-7 items-center rounded-md border border-[#1E3A8A] bg-[#1E3A8A] px-2 text-[11px] font-extrabold text-white transition hover:bg-[#163170]"
                      >
                        تقرير مخصص
                      </button>
                    </form>
                  </div>
                </summary>
                <div className="space-y-2 border-t border-[#E2E8F0] px-3 py-2">
                  {formation.branches.map((branch) => (
                    <div key={`${formation.formationLabel}-${branch.branchName}`} className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-2">
                      <p className="text-xs font-extrabold text-[#334155]">{branch.branchName}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {branch.examDates.map((d) => (
                          <a
                            key={`${formation.formationLabel}-${branch.branchName}-${d}`}
                            href={`#${formationDayAnchorId(d, formation.formationLabel)}`}
                            className="inline-flex rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-1 text-[11px] font-bold text-[#1E3A8A] transition hover:bg-[#DBEAFE]"
                            title={`الانتقال إلى ${formation.formationLabel} في يوم ${d}`}
                          >
                            {d}
                          </a>
                        ))}
                        {branch.examDates.length === 0 ? (
                          <span className="text-[11px] font-medium text-[#94A3B8]">لا توجد تواريخ صالحة</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm" aria-label="تقرير يومي رسمي">
        <h2 className="text-base font-extrabold text-[#0F172A]">التقرير اليومي الرسمي (A4 PDF)</h2>
        <p className="mt-1 text-xs text-[#64748B]">
          اطبع تقريرًا رسميًا جدولياً لليوم المحدد يتضمن: التشكيل، القسم/الفرع، المادة، المرحلة، الوجبة، نوع الامتحان، الاعتماد، والمصادقة.
        </p>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          method="get"
          action="/dashboard/situations-followup/daily-report"
          target="_blank"
        >
          <label className="flex min-w-[220px] flex-col gap-1 text-xs font-bold text-[#334155]">
            اليوم الامتحاني
            <select
              name="examDate"
              defaultValue={defaultExamDate}
              className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-2 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#BFDBFE]"
            >
              {availableExamDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-lg border border-[#1E3A8A] bg-[#1E3A8A] px-3 text-sm font-bold text-white transition hover:bg-[#163170]"
          >
            طباعة التقرير اليومي / حفظ PDF
          </button>
        </form>
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
          <p className="text-xs font-bold text-emerald-800">تصفية التقرير</p>
          <p className="mt-1 text-[11px] text-emerald-700">
            استخدم هذا الخيار لطباعة تقرير PDF مفلتر حسب مصادقة العميد واعتماد رئيس القسم/الفرع، دون التأثير على الزر
            اليومي الأصلي أعلاه.
          </p>
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            method="get"
            action="/dashboard/situations-followup/daily-report-filtered"
            target="_blank"
          >
            <label className="flex min-w-[220px] flex-col gap-1 text-xs font-bold text-[#334155]">
              اليوم الامتحاني
              <select
                name="examDate"
                defaultValue={defaultExamDate}
                className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-2 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#BFDBFE]"
              >
                {availableExamDates.map((d) => (
                  <option key={`f-${d}`} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[220px] flex-col gap-1 text-xs font-bold text-[#334155]">
              مصادقة حساب العميد
              <select
                name="deanAuthFilter"
                value={deanAuthFilter}
                onChange={(e) => setDeanAuthFilter(e.target.value as "ALL" | "AUTHED" | "NOT_AUTHED")}
                className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-2 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#BFDBFE]"
              >
                <option value="ALL">الكل</option>
                <option value="AUTHED">مصادق فقط</option>
                <option value="NOT_AUTHED">غير مصادق فقط</option>
              </select>
            </label>
            <label className="flex min-w-[220px] flex-col gap-1 text-xs font-bold text-[#334155]">
              اعتماد رئيس القسم/الفرع
              <select
                name="deptApprovalFilter"
                value={deptApprovalFilter}
                onChange={(e) =>
                  setDeptApprovalFilter(e.target.value as "ALL" | "APPROVED" | "NOT_APPROVED")
                }
                className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-2 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#BFDBFE]"
              >
                <option value="ALL">الكل</option>
                <option value="APPROVED">معتمد فقط</option>
                <option value="NOT_APPROVED">غير معتمد فقط</option>
              </select>
            </label>
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-lg border border-emerald-700 bg-emerald-700 px-3 text-sm font-bold text-white transition hover:bg-emerald-800"
            >
              طباعة التقرير بالتصفية / حفظ PDF
            </button>
          </form>
        </div>
      </section>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-6 py-14 text-center text-sm text-[#64748B]">
          لا توجد مواقف رسمية بعد. تظهر هنا تلقائياً بعد إرسال/اعتماد جداول الامتحان ورفع الموقف من صفحات الأقسام والفروع.
        </div>
      ) : (
        <div className="space-y-10">
          {dates.map((dateKey) => {
            const formationsMap = byDate.get(dateKey)!;
            const formationKeys = [...formationsMap.keys()].sort((a, b) => a.localeCompare(b, "ar"));
            return (
              <section
                key={dateKey}
                className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm"
                aria-labelledby={`day-${dateKey}`}
              >
                <div className="border-b border-[#E2E8F0] bg-[#F1F5F9] px-4 py-3">
                  <h2 id={`day-${dateKey}`} className="text-base font-extrabold text-[#0F172A]">
                    {dateKey === "—" ? "بدون تاريخ في السجل" : formatExamDateAr(dateKey)}
                  </h2>
                  <p className="mt-0.5 text-xs font-semibold text-[#64748B]">
                    {formatNum(
                      formationKeys.reduce((s, fk) => s + (formationsMap.get(fk)?.length ?? 0), 0)
                    )}{" "}
                    موقفاً في هذا اليوم
                  </p>
                </div>
                <div className="space-y-6 p-4">
                  {formationKeys.map((formationKey) => {
                    const list = formationsMap.get(formationKey)!;
                    return (
                      <div
                        id={formationDayAnchorId(dateKey, formationKey)}
                        key={`${dateKey}-${formationKey}`}
                        className="rounded-xl border border-[#E8EEF7] bg-[#FAFBFC]"
                      >
                        <div className="border-b border-[#E2E8F0] bg-white px-3 py-2">
                          <h3 className="text-sm font-extrabold text-[#1E3A8A]">{formationKey}</h3>
                          <p className="text-[11px] text-[#64748B]">
                            {formatNum(list.length)} موقفاً · المستخدم: {list[0]?.owner_username ?? "—"}
                          </p>
                        </div>
                        <div className="overflow-x-auto p-2">
                          <table className="w-full min-w-[980px] border-collapse text-right text-sm">
                            <thead>
                              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-bold text-[#475569]">
                                <th className="px-2 py-2">ت</th>
                                <th className="px-2 py-2">اليوم الامتحاني</th>
                                <th className="px-2 py-2">الوجبة</th>
                                <th className="px-2 py-2">المادة</th>
                                <th className="px-2 py-2">القسم / الفرع</th>
                                <th className="px-2 py-2">المرحلة</th>
                                <th className="px-2 py-2">الامتحان</th>
                                <th className="px-2 py-2">اعتماد رئيس القسم/الفرع</th>
                                <th className="px-2 py-2">مصادقة العميد</th>
                                <th className="px-2 py-2">وقت المصادقة</th>
                                <th className="px-2 py-2">التقرير</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F1F5F9]">
                              {list.map((item, idx) => (
                                <tr key={item.schedule_id} className="bg-white hover:bg-[#F0F9FF]/60">
                                  <td className="px-2 py-2 font-bold tabular-nums text-[#94A3B8]" lang="en">
                                    {idx + 1}
                                  </td>
                                  <td className="px-2 py-2 text-xs text-[#334155]">{formatExamDateAr(item.exam_date)}</td>
                                  <td className="px-2 py-2 text-xs text-[#334155]">{item.meal_slot === 2 ? "الثانية" : "الأولى"}</td>
                                  <td className="px-2 py-2 font-semibold text-[#0F172A]">{item.subject_name}</td>
                                  <td className="px-2 py-2 text-[#334155]">{item.branch_name}</td>
                                  <td className="px-2 py-2 text-xs text-[#64748B]">
                                    {formatCollegeStudyStageLabel(item.stage_level)}
                                  </td>
                                  <td className="px-2 py-2 text-xs text-[#64748B]">{item.schedule_type === "SEMESTER" ? "نصفي" : "نهائي"}</td>
                                  <td className="px-2 py-2 text-xs">
                                    <span
                                      className={`inline-flex rounded-full px-2 py-1 font-bold ${
                                        item.dean_status === "APPROVED"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : item.dean_status === "REJECTED"
                                            ? "bg-rose-100 text-rose-800"
                                            : "bg-amber-100 text-amber-800"
                                      }`}
                                    >
                                      {deptApprovalLabel(item.dean_status)}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-xs">
                                    <span
                                      className={`inline-flex rounded-full px-2 py-1 font-bold ${
                                        item.is_uploaded ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-700"
                                      }`}
                                    >
                                      {deanAuthLabel(item.is_uploaded)}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-[11px] text-[#64748B]" lang="en" dir="ltr">
                                    {item.head_submitted_at_iso ? formatSubmittedAt(item.head_submitted_at_iso) : "—"}
                                  </td>
                                  <td className="px-2 py-2 text-xs">
                                    <a
                                      href={`/dashboard/situations-followup/report?ownerUserId=${encodeURIComponent(item.owner_user_id)}&scheduleId=${encodeURIComponent(item.schedule_id)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex rounded-lg border border-[#1E3A8A] bg-white px-2 py-1 font-bold text-[#1E3A8A] transition hover:bg-[#EFF6FF]"
                                    >
                                      تقرير الموقف
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-left">
                          <a href="#top" className="text-[11px] font-bold text-[#2563EB] hover:underline">
                            رجوع للأعلى
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  accent,
}: {
  title: string;
  value: string;
  hint: string;
  accent: "blue" | "slate" | "emerald" | "amber";
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
    <div className="relative flex min-h-[92px] flex-col justify-between overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l ${bar}`} aria-hidden />
      <p className="text-[10px] font-bold leading-tight text-[#64748B]">{title}</p>
      <p className="text-2xl font-extrabold tabular-nums tracking-tight text-[#0F172A]" lang="en">
        {value}
      </p>
      <p className="text-[10px] leading-tight text-[#94A3B8]">{hint}</p>
    </div>
  );
}
