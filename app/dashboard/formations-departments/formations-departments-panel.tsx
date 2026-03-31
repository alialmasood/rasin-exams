"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type {
  AdminFormationControlRoomData,
  FormationControlSnapshot,
  FormationExamScheduleDetailRow,
} from "@/lib/admin-formations-departments";
import type { StudyType } from "@/lib/college-study-subjects";
import { STUDY_TYPE_LABEL_AR } from "@/lib/study-type-labels-ar";

function formatNum(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function statusLabelAr(status: string): string {
  switch (String(status).toUpperCase()) {
    case "ACTIVE":
      return "نشط";
    case "DISABLED":
      return "معطّل";
    case "LOCKED":
      return "مقفل";
    case "PENDING":
      return "قيد المراجعة";
    default:
      return status;
  }
}

function Pill({ children, tone }: { children: ReactNode; tone: "slate" | "emerald" | "amber" | "rose" }) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-900 ring-emerald-500/20"
      : tone === "amber"
        ? "bg-amber-50 text-amber-900 ring-amber-500/25"
        : tone === "rose"
          ? "bg-rose-50 text-rose-900 ring-rose-500/20"
          : "bg-slate-100 text-slate-800 ring-slate-300/40";
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-bold ring-1 ${cls}`}>{children}</span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-[#FAFBFC] p-4">
      <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wide text-[#475569]">{title}</h3>
      {children}
    </section>
  );
}

const SCHEDULE_TYPE_AR: Record<FormationExamScheduleDetailRow["schedule_type"], string> = {
  FINAL: "نهائي",
  SEMESTER: "فصلي",
};

function workflowLabelAr(st: FormationExamScheduleDetailRow["workflow_status"]): string {
  switch (st) {
    case "DRAFT":
      return "مسودة";
    case "SUBMITTED":
      return "مرفوع للمتابعة";
    case "APPROVED":
      return "معتمد";
    case "REJECTED":
      return "مرفوض";
    default:
      return st;
  }
}

function workflowBadgeClass(st: FormationExamScheduleDetailRow["workflow_status"]): string {
  if (st === "APPROVED" || st === "SUBMITTED") return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  if (st === "REJECTED") return "bg-red-100 text-red-900 ring-red-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function formatExamDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium" }).format(d);
}

function FormationExamScheduleDetailBlock({
  formationId,
  rows,
}: {
  formationId: string;
  rows: FormationExamScheduleDetailRow[];
}) {
  const [wf, setWf] = useState<string>("all");
  const filtered = useMemo(() => {
    if (wf === "all") return rows;
    return rows.filter((r) => r.workflow_status === wf);
  }, [rows, wf]);
  const selectId = `sched-wf-${formationId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  return (
    <details className="rounded-2xl border border-[#BFDBFE] bg-[#F8FAFC] open:bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-[#1E3A8A] marker:content-none [&::-webkit-details-marker]:hidden">
        الجدول الامتحاني — عرض التفصيل
        <span className="mr-2 font-extrabold tabular-nums text-[#64748B]">({formatNum(rows.length)} جلسة)</span>
      </summary>
      <div className="border-t border-[#E2E8F0] px-3 pb-4 pt-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label htmlFor={selectId} className="text-[11px] font-bold text-[#64748B]">
            تصفية حسب الحالة:
          </label>
          <select
            id={selectId}
            value={wf}
            onChange={(e) => setWf(e.target.value)}
            className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-xs font-semibold text-[#0F172A] outline-none focus:border-[#2563EB]/40"
          >
            <option value="all">الكل</option>
            <option value="DRAFT">مسودة</option>
            <option value="SUBMITTED">مرفوع للمتابعة</option>
            <option value="APPROVED">معتمد</option>
            <option value="REJECTED">مرفوض</option>
          </select>
          <span className="text-[11px] text-[#94A3B8] tabular-nums">
            يظهر {formatNum(filtered.length)} من {formatNum(rows.length)}
          </span>
          <Link
            href="/dashboard/exams"
            className="ms-auto text-[11px] font-bold text-[#2563EB] underline-offset-2 hover:underline"
          >
            صفحة متابعة الجداول لجميع التشكيلات
          </Link>
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#64748B]">لا توجد جلسات مجدولة في الجدول الامتحاني.</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#64748B]">لا جلسات بهذه الحالة.</p>
        ) : (
          <div className="max-h-[min(70vh,26rem)] overflow-auto rounded-xl ring-1 ring-[#E2E8F0]">
            <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-right text-[11px]">
              <thead>
                <tr className="sticky top-0 z-[1] border-b border-[#E2E8F0] bg-[#EFF6FF]">
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">التاريخ</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">الوقت</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">المادة</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">القسم</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">القاعة</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">مرحلة</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">النوع</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">الحالة</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">سنة / فصل</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] bg-white">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-[#F8FAFC]">
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums text-[#334155]">{formatExamDate(r.exam_date)}</td>
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums text-[#475569]">
                      {r.start_time} – {r.end_time}
                    </td>
                    <td className="max-w-[140px] px-2 py-2 font-semibold text-[#0F172A]">{r.study_subject_name}</td>
                    <td className="max-w-[120px] px-2 py-2 text-[#475569]">{r.college_subject_name}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-[#475569]">{r.room_name}</td>
                    <td className="px-2 py-2 text-center tabular-nums font-semibold text-[#334155]">{formatNum(r.stage_level)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-[#64748B]">{SCHEDULE_TYPE_AR[r.schedule_type]}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ring-1 ${workflowBadgeClass(r.workflow_status)}`}
                      >
                        {workflowLabelAr(r.workflow_status)}
                      </span>
                    </td>
                    <td className="max-w-[100px] px-2 py-2 text-[10px] leading-snug text-[#64748B]">
                      {[r.academic_year, r.term_label].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="max-w-[160px] px-2 py-2 text-[10px] text-[#64748B]">{r.notes?.trim() || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

function FormationCard({ f }: { f: FormationControlSnapshot }) {
  const scheduleFinalized = f.schedules_submitted + f.schedules_approved;
  const studyTypes: StudyType[] = ["ANNUAL", "SEMESTER", "COURSES", "BOLOGNA"];
  const activeStudyTypes = studyTypes.filter((t) => (f.study_subjects_by_type[t] ?? 0) > 0);
  const supShow = f.supervisors_unique.slice(0, 12);
  const supMore = Math.max(0, f.supervisors_unique.length - supShow.length);

  return (
    <details className="group rounded-2xl border border-[#E2E8F0] bg-white shadow-sm open:shadow-md open:ring-1 open:ring-[#2563EB]/10">
      <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 marker:content-none md:flex-row md:items-center md:justify-between [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-lg font-bold text-[#0F172A]">{f.formation_name?.trim() || "تشكيل بدون اسم"}</span>
          <Pill tone={f.is_active ? "emerald" : "rose"}>{statusLabelAr(f.user_status)}</Pill>
          <span className="text-xs text-[#94A3B8] tabular-nums">@{f.owner_username}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#475569] md:justify-end">
          <span className="rounded-lg bg-[#F1F5F9] px-2 py-1 tabular-nums">
            أقسام {formatNum(f.departments.length)} · فروع {formatNum(f.branches.length)}
          </span>
          <span className="rounded-lg bg-[#F1F5F9] px-2 py-1 tabular-nums">مواد {formatNum(f.study_subjects_total)}</span>
          <span className="rounded-lg bg-[#F1F5F9] px-2 py-1 tabular-nums">قاعات {formatNum(f.exam_rooms_count)}</span>
          <span className="rounded-lg bg-[#EFF6FF] px-2 py-1 tabular-nums text-[#1E3A8A]">
            جدول: {formatNum(scheduleFinalized)}/{formatNum(f.schedules_total)}
          </span>
          <span className="rounded-lg bg-[#FEF3C7] px-2 py-1 tabular-nums text-[#92400E]">
            موقف مرفوع {formatNum(f.situation_head_submitted)} · معلّق {formatNum(f.situation_pending_after_schedule)}
          </span>
        </div>
      </summary>

      <div className="space-y-4 border-t border-[#E2E8F0] px-4 pb-5 pt-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="الأقسام والفروع">
            {f.departments.length === 0 && f.branches.length === 0 ? (
              <p className="text-sm text-[#64748B]">لا توجد أقسام أو فروع مسجّلة بعد.</p>
            ) : (
              <div className="space-y-4">
                {f.departments.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-bold text-[#64748B]">الأقسام ({formatNum(f.departments.length)})</p>
                    <ul className="max-h-40 space-y-1.5 overflow-y-auto text-sm">
                      {f.departments.map((d) => (
                        <li key={d.id} className="flex flex-wrap gap-x-2 border-b border-[#E2E8F0]/80 py-1.5 last:border-0">
                          <span className="font-semibold text-[#0F172A]">{d.branch_name}</span>
                          <span className="text-[#64748B]">— رئيس القسم:</span>
                          <span className="text-[#334155]">{d.branch_head_name || "—"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {f.branches.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-bold text-[#64748B]">الفروع ({formatNum(f.branches.length)})</p>
                    <ul className="max-h-32 space-y-1.5 overflow-y-auto text-sm">
                      {f.branches.map((b) => (
                        <li key={b.id} className="flex flex-wrap gap-x-2 border-b border-[#E2E8F0]/80 py-1.5 last:border-0">
                          <span className="font-semibold text-[#0F172A]">{b.branch_name}</span>
                          <span className="text-[#64748B]">— المسؤول:</span>
                          <span className="text-[#334155]">{b.branch_head_name || "—"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </Section>

          <Section title="نوع الدراسة (من المواد الدراسية)">
            {activeStudyTypes.length === 0 ? (
              <p className="text-sm text-[#64748B]">لا توجد مواد دراسية بعد.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {activeStudyTypes.map((t) => (
                  <li key={t}>
                    <Pill tone="slate">
                      {STUDY_TYPE_LABEL_AR[t]}: {formatNum(f.study_subjects_by_type[t] ?? 0)}
                    </Pill>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section title="المواد الدراسية — آخر التحديثات (عيّنة)">
          {f.study_subjects_recent.length === 0 ? (
            <p className="text-sm text-[#64748B]">لا توجد مواد.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-right text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[10px] font-extrabold uppercase text-[#64748B]">
                    <th className="pb-2">المادة</th>
                    <th className="pb-2">المرحلة</th>
                    <th className="pb-2">القسم / الفرع</th>
                    <th className="pb-2">النوع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]/90">
                  {f.study_subjects_recent.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 font-semibold text-[#0F172A]">{r.subject_name}</td>
                      <td className="py-2 tabular-nums text-[#475569]">{formatNum(r.study_stage_level)}</td>
                      <td className="py-2 text-[#475569]">{r.linked_branch_name}</td>
                      <td className="py-2 text-[#64748B]">{STUDY_TYPE_LABEL_AR[r.study_type]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="قاعات الامتحان — السعة والمشرفون والمراقبون">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2">
              <p className="text-[10px] font-bold text-[#64748B]">عدد القاعات</p>
              <p className="text-xl font-bold tabular-nums text-[#0F172A]">{formatNum(f.exam_rooms_count)}</p>
            </div>
            <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2">
              <p className="text-[10px] font-bold text-[#64748B]">سعة صباحي</p>
              <p className="text-xl font-bold tabular-nums text-[#0F172A]">{formatNum(f.capacity_morning_sum)}</p>
            </div>
            <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2">
              <p className="text-[10px] font-bold text-[#64748B]">سعة مسائي</p>
              <p className="text-xl font-bold tabular-nums text-[#0F172A]">{formatNum(f.capacity_evening_sum)}</p>
            </div>
            <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2">
              <p className="text-[10px] font-bold text-[#64748B]">إجمالي المقاعد</p>
              <p className="text-xl font-bold tabular-nums text-[#1E3A8A]">{formatNum(f.capacity_total_sum)}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold text-[#64748B]">
              مشرفون مميّزون ({formatNum(f.supervisors_unique.length)}) — قاعات بأسماء مراقبين:{" "}
              {formatNum(f.rooms_with_invigilators)}
            </p>
            {f.supervisors_unique.length === 0 ? (
              <p className="text-sm text-[#94A3B8]">لا توجد أسماء مشرفين مسجّلة في القاعات.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {supShow.map((name) => (
                  <span
                    key={name}
                    className="rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-[#334155] ring-1 ring-[#E2E8F0]"
                  >
                    {name}
                  </span>
                ))}
                {supMore > 0 ? (
                  <span className="rounded-lg bg-[#F1F5F9] px-2 py-1 text-[11px] font-bold text-[#64748B]">
                    +{formatNum(supMore)}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="الجداول الامتحانية (حسب حالة سير العمل)">
            <div className="mb-3 flex flex-wrap gap-2 text-[11px] font-semibold">
              <Pill tone="slate">إجمالي الجلسات: {formatNum(f.schedules_total)}</Pill>
              <Pill tone="amber">مسودة: {formatNum(f.schedules_draft)}</Pill>
              <Pill tone="emerald">مرفوع: {formatNum(f.schedules_submitted)}</Pill>
              <Pill tone="emerald">معتمد: {formatNum(f.schedules_approved)}</Pill>
              <Pill tone="rose">مرفوض: {formatNum(f.schedules_rejected)}</Pill>
            </div>
            <p className="text-xs leading-relaxed text-[#64748B]">
              «مكتمل في الجدول» هنا يعني الجلسات التي خرجت من المسودة: مرفوعة للمتابعة أو معتمدة أو مرفوضة (
              {formatNum(f.schedules_total - f.schedules_draft)} من {formatNum(f.schedules_total)}).
            </p>
          </Section>

          <Section title="الموقف الامتحاني (رفع الموقف)">
            <div className="mb-2 flex flex-wrap gap-2 text-[11px] font-semibold">
              <Pill tone="emerald">أُكمل تأكيد الرفع: {formatNum(f.situation_head_submitted)}</Pill>
              <Pill tone="amber">بانتظار الرفع (جدول مرفوع/معتمد): {formatNum(f.situation_pending_after_schedule)}</Pill>
            </div>
            <p className="text-xs leading-relaxed text-[#64748B]">
              يُحسب «مكتمل» عند تأكيد رفع الموقف من رئيس الفرع. «بانتظار الرفع» للجلسات ذات الجدول مرفوع أو معتمد ولم يُؤكَّد
              الرفع بعد.
            </p>
          </Section>
        </div>

        <FormationExamScheduleDetailBlock formationId={f.owner_user_id} rows={f.exam_schedules_detail} />
      </div>
    </details>
  );
}

export function FormationsDepartmentsPanel({ data }: { data: AdminFormationControlRoomData }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.formations;
    return data.formations.filter((f) => {
      const schedBlob = f.exam_schedules_detail
        .map(
          (r) =>
            `${r.study_subject_name} ${r.college_subject_name} ${r.room_name} ${r.exam_date} ${r.workflow_status} ${r.notes ?? ""}`
        )
        .join(" ");
      const blob = [
        f.formation_name ?? "",
        f.owner_username,
        f.departments.map((d) => `${d.branch_name} ${d.branch_head_name}`).join(" "),
        f.branches.map((b) => `${b.branch_name} ${b.branch_head_name}`).join(" "),
        schedBlob,
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [data.formations, query]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6" dir="rtl">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold text-[#0F172A] md:text-3xl">غرفة مراقبة — التشكيلات والأقسام</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-[#64748B] md:text-base">
          نظرة مركزية على كل تشكيل: الأقسام ورؤساؤها، المواد والمراحل، القاعات والسعات، الجداول الامتحانية، وحالة رفع الموقف
          الامتحاني. اضغط على التشكيل للتفصيل.
        </p>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white p-5 shadow-sm">
          <p className="text-sm font-bold text-emerald-900/90">تشكيلات نشطة</p>
          <p className="mt-2 text-4xl font-extrabold tabular-nums text-emerald-800">{formatNum(data.activeFormationCount)}</p>
          <p className="mt-1 text-xs text-emerald-800/75">حسابات بحالة «نشط» في النظام</p>
        </div>
        <div className="rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50/90 to-white p-5 shadow-sm">
          <p className="text-sm font-bold text-rose-900/90">تشكيلات غير نشطة</p>
          <p className="mt-2 text-4xl font-extrabold tabular-nums text-rose-800">{formatNum(data.inactiveFormationCount)}</p>
          <p className="mt-1 text-xs text-rose-800/75">معطّل، مقفل، أو قيد المراجعة</p>
        </div>
      </div>

      <div className="mb-5">
        <label htmlFor="formation-search" className="mb-1.5 block text-xs font-bold text-[#475569]">
          بحث سريع (اسم التشكيل، المستخدم، قسم…)
        </label>
        <input
          id="formation-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابدأ الكتابة للتصفية…"
          className="h-11 w-full max-w-md rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm text-[#0F172A] shadow-sm outline-none transition focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/15"
        />
        <p className="mt-1.5 text-[11px] text-[#94A3B8]">
          يعرض {formatNum(filtered.length)} من {formatNum(data.formations.length)} تشكيلًا
        </p>
      </div>

      {data.formations.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-12 text-center text-sm text-[#64748B]">
          لا توجد حسابات تشكيل مسجّلة.
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-10 text-center text-sm text-[#64748B]">
          لا نتائج مطابقة للبحث.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => (
            <FormationCard key={f.owner_user_id} f={f} />
          ))}
        </div>
      )}
    </div>
  );
}
