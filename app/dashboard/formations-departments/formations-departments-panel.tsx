"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  AdminFormationControlRoomData,
  FormationControlSnapshot,
  FormationExamScheduleDetailRow,
} from "@/lib/admin-formations-departments";
import type { FormationActivityItem } from "@/lib/formation-activity-feed";
import { fetchFormationActivityFeedAction } from "./actions";
import type { StudyType } from "@/lib/college-study-subjects";
import {
  formatCollegeStudyLevelTierLabel,
  formatCollegeStudyStageLabel,
  isPostgraduateStudyStageLevel,
} from "@/lib/college-study-stage-display";
import { STUDY_TYPE_LABEL_AR } from "@/lib/study-type-labels-ar";
import { formatExamMealSlotLabel } from "@/lib/exam-meal-slot";

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

function FormationScheduleStudyLevelCell({
  stageLevel,
  studyType,
}: {
  stageLevel: number;
  studyType: StudyType;
}) {
  const lv = Number(stageLevel);
  return (
    <div className="min-w-0 space-y-2 text-right">
      <div>
        <p className="text-[9px] font-bold text-[#64748B]">المستوى الدراسي</p>
        <div className="mt-1 space-y-0.5">
          <span
            className={`inline-flex max-w-full rounded-full px-2 py-0.5 text-[9px] font-bold break-words ${
              isPostgraduateStudyStageLevel(lv)
                ? "bg-[#EEF2FF] text-[#4338CA] ring-1 ring-[#A5B4FC]/50"
                : "bg-[#F0FDFA] text-[#0F766E] ring-1 ring-[#99F6E4]/70"
            }`}
          >
            {formatCollegeStudyLevelTierLabel(lv)}
          </span>
          {!isPostgraduateStudyStageLevel(lv) ? (
            <div className="text-[10px] font-semibold text-[#64748B]">{formatCollegeStudyStageLabel(lv)}</div>
          ) : null}
        </div>
      </div>
      <div className="border-t border-[#E2E8F0] pt-2">
        <p className="text-[9px] font-bold text-[#64748B]">نوع الدراسة</p>
        <p className="mt-1 text-[10px] font-semibold text-[#334155]">{STUDY_TYPE_LABEL_AR[studyType]}</p>
      </div>
    </div>
  );
}

/** أرقام عربية شرقية — يُركَّب النص يدويًا بعد قراءة تقسيمات ثابتة لتطابق الخادم والمتصفح. */
const EASTERN_ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"] as const;

function toEasternArabicDigits(westernNumericString: string): string {
  return westernNumericString.replace(/\d/g, (d) => EASTERN_ARABIC_DIGITS[Number(d)] ?? d);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

const MONTH_NAME_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;

/** توقيت بغداد عبر formatToParts + en-CA — أرقام وتقسيمات متسقة بين Node والمتصفح لنفس اللحظة. */
function readInstantInBaghdad(iso: string): {
  y: number;
  m: number;
  day: number;
  h12: number;
  min: number;
  isAm: boolean;
} 
  | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  let y = 0;
  let m = 0;
  let day = 0;
  let h12 = 0;
  let min = 0;
  let dayPeriod = "AM";
  for (const p of f.formatToParts(d)) {
    if (p.type === "year") y = Number(p.value);
    if (p.type === "month") m = Number(p.value);
    if (p.type === "day") day = Number(p.value);
    if (p.type === "hour") h12 = Number(p.value);
    if (p.type === "minute") min = Number(p.value);
    if (p.type === "dayPeriod") dayPeriod = p.value.toUpperCase();
  }
  if (!Number.isFinite(y) || !Number.isFinite(day) || m < 1 || m > 12) return null;
  const isAm = dayPeriod === "AM";
  return { y, m, day, h12, min, isAm };
}

function formatExamDate(iso: string): string {
  if (!iso) return "—";
  const t = readInstantInBaghdad(iso);
  if (!t) return iso;
  const western = `${t.day} ${MONTH_NAME_AR[t.m - 1]!} ${t.y}`;
  return toEasternArabicDigits(western);
}

function formatActivityAt(iso: string): string {
  if (!iso) return "—";
  const t = readInstantInBaghdad(iso);
  if (!t) return iso;
  const suffix = t.isAm ? "ص" : "م";
  const western = `${t.day}/${t.m}/${t.y}، ${t.h12}:${pad2(t.min)} ${suffix}`;
  return toEasternArabicDigits(western);
}

/**
 * شريط تحديثات: حركة عمودية واحدة من الأسفل إلى الأعلى ثم الاستقرار عند أحدث حدث؛ تُعاد عند تغيّر القائمة.
 * الجلب التلقائي كل بضع ثوانٍ (مع إظهار التبويب) دون الحاجة لزر التحديث.
 */
function FormationActivityFeedCard({ initialItems }: { initialItems: FormationActivityItem[] }) {
  const [items, setItems] = useState<FormationActivityItem[]>(initialItems);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const reducedScrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);

  const feedSignature = useMemo(() => items.map((x) => x.id).join("\0"), [items]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const fn = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetchFormationActivityFeedAction();
    if (!res.ok) {
      setFeedError(res.error ?? "تعذّر تحديث الشريط");
      return;
    }
    setFeedError(null);
    setItems(res.items);
  }, []);

  useEffect(() => {
    const POLL_MS = 5_000;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void refresh();
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  useLayoutEffect(() => {
    if (reduceMotion || items.length === 0) return;
    const outer = viewportRef.current;
    const track = trackRef.current;
    if (!outer || !track) return;

    animRef.current?.cancel();
    animRef.current = null;

    const hOut = outer.clientHeight;
    const hIn = track.scrollHeight;
    const fromY = hIn > hOut ? hOut - hIn : 0;
    const travel = Math.abs(fromY);
    const durationMs = travel <= 1 ? 0 : Math.min(10_000, Math.max(1_200, travel * 5.5));

    track.style.transform = `translateY(${fromY}px)`;

    if (durationMs === 0) {
      track.style.transform = "translateY(0px)";
      return;
    }

    const anim = track.animate(
      [{ transform: `translateY(${fromY}px)` }, { transform: "translateY(0px)" }],
      { duration: durationMs, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "forwards" }
    );
    animRef.current = anim;
    return () => {
      anim.cancel();
    };
  }, [feedSignature, reduceMotion, items.length]);

  useLayoutEffect(() => {
    if (!reduceMotion) return;
    const el = reducedScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [feedSignature, reduceMotion]);

  return (
    <div className="flex min-h-[220px] flex-col rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/95 to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-indigo-950">آخر التحديثات من التشكيلات</p>
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-bold text-emerald-900 ring-1 ring-emerald-500/25"
            title="يتم جلب الإنشاءات والتعديلات تلقائياً كل بضع ثوانٍ طالما الصفحة ظاهرة"
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
            </span>
            مباشر
          </span>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="shrink-0 rounded-lg border border-indigo-300/60 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-900 shadow-sm hover:bg-indigo-50"
        >
          تحديث
        </button>
      </div>

      {feedError ? <p className="mt-2 text-[11px] text-amber-800">{feedError}</p> : null}

      <div className="mt-3 min-h-[168px] flex-1">
        {items.length === 0 ? (
          <div className="flex h-full min-h-[168px] items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-white/70 px-3 text-center text-sm text-indigo-900/65">
            لا توجد تحديثات مسجّلة حديثاً من التشكيلات. سيُعرض التمرير تلقائياً عند تسجيل إنشاءات أو تعديلات جديدة.
          </div>
        ) : reduceMotion ? (
          <div
            ref={reducedScrollRef}
            className="h-[168px] overflow-y-auto rounded-xl border border-indigo-100 bg-white/90 px-3 py-2 shadow-inner"
          >
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {items.map((it) => (
                <li key={it.id} className="border-b border-indigo-100/90 pb-2.5 text-right last:border-b-0">
                  <p className="text-[12px] font-medium leading-snug text-[#0F172A]">{it.line_ar}</p>
                  <p className="mt-1 text-[10px] tabular-nums text-[#64748B]">{formatActivityAt(it.occurred_at)}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div
            ref={viewportRef}
            className="relative h-[168px] overflow-hidden rounded-xl border border-indigo-100 bg-white/90 shadow-inner"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-7 bg-gradient-to-b from-white to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-7 bg-gradient-to-t from-white to-transparent" />
            <div ref={trackRef} className="flex flex-col gap-2.5 px-3 py-2 will-change-transform">
              {items.map((it) => (
                <div key={it.id} className="shrink-0 border-b border-indigo-100/90 pb-2.5 text-right last:border-b-0">
                  <p className="text-[12px] font-medium leading-snug text-[#0F172A]">{it.line_ar}</p>
                  <p className="mt-1 text-[10px] tabular-nums text-[#64748B]">{formatActivityAt(it.occurred_at)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
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
            <table className="w-full min-w-[1020px] border-separate border-spacing-0 text-right text-[11px]">
              <thead>
                <tr className="sticky top-0 z-[1] border-b border-[#E2E8F0] bg-[#EFF6FF]">
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">التاريخ</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">الوجبة</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">الوقت</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">المادة</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">القسم</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">القاعة</th>
                  <th className="min-w-[8.5rem] px-2 py-2.5 font-extrabold text-[#475569]">المستوى الدراسي</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">نوع الجدول</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">الحالة</th>
                  <th className="px-2 py-2.5 font-extrabold text-[#475569]">سنة / فصل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] bg-white">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-[#F8FAFC]">
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums text-[#334155]">{formatExamDate(r.exam_date)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-[11px] font-semibold text-[#475569]">
                      {formatExamMealSlotLabel(r.meal_slot)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums text-[#475569]">
                      {r.start_time} – {r.end_time}
                    </td>
                    <td className="max-w-[140px] px-2 py-2 font-semibold text-[#0F172A]">{r.study_subject_name}</td>
                    <td className="max-w-[120px] px-2 py-2 text-[#475569]">{r.college_subject_name}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-[#475569]">{r.room_name}</td>
                    <td className="align-top px-2 py-2">
                      <FormationScheduleStudyLevelCell stageLevel={r.stage_level} studyType={r.study_type} />
                    </td>
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
  /** جلسات خرجت من المسودة (مرفوع + معتمد + مرفوض) — يطابق النص في قسم «الجداول الامتحانية» */
  const schedulePastDraft = f.schedules_total - f.schedules_draft;
  /** مطابقة تقويم الكلية: هناك «مرفوع» = جلسات معتمدة أو مرفوعة للمتابعة (ليست مسودة ولا مرفوضة فقط) */
  const schedulePublishedLikeCalendar = f.schedules_submitted + f.schedules_approved;
  const studyTypes: StudyType[] = ["ANNUAL", "SEMESTER", "COURSES", "BOLOGNA", "INTEGRATIVE"];
  const activeStudyTypes = studyTypes.filter((t) => (f.study_subjects_by_type[t] ?? 0) > 0);
  const supShow = f.supervisors_unique.slice(0, 12);
  const supMore = Math.max(0, f.supervisors_unique.length - supShow.length);
  const invShow = f.invigilators_unique.slice(0, 18);
  const invMore = Math.max(0, f.invigilators_unique.length - invShow.length);

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
            جدول: {formatNum(schedulePastDraft)}/{formatNum(f.schedules_total)}
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

        {f.postgrad_subjects_total > 0 || f.postgrad_exam_sessions_total > 0 ? (
          <Section title="الدراسات العليا">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {f.postgrad_subjects_total > 0 ? (
                <div className="rounded-xl border border-violet-200/90 bg-gradient-to-br from-violet-50/95 to-white px-3 py-2 shadow-sm">
                  <p className="text-[10px] font-bold text-violet-900/75">مواد دراسات عليا</p>
                  <p className="text-xl font-bold tabular-nums text-violet-950">{formatNum(f.postgrad_subjects_total)}</p>
                </div>
              ) : null}
              {f.postgrad_subjects_diploma > 0 ? (
                <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2">
                  <p className="text-[10px] font-bold text-[#64748B]">دبلوم عالي</p>
                  <p className="text-lg font-bold tabular-nums text-[#0F172A]">{formatNum(f.postgrad_subjects_diploma)}</p>
                </div>
              ) : null}
              {f.postgrad_subjects_master > 0 ? (
                <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2">
                  <p className="text-[10px] font-bold text-[#64748B]">ماجستير</p>
                  <p className="text-lg font-bold tabular-nums text-[#0F172A]">{formatNum(f.postgrad_subjects_master)}</p>
                </div>
              ) : null}
              {f.postgrad_subjects_doctor > 0 ? (
                <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2">
                  <p className="text-[10px] font-bold text-[#64748B]">دكتوراه</p>
                  <p className="text-lg font-bold tabular-nums text-[#0F172A]">{formatNum(f.postgrad_subjects_doctor)}</p>
                </div>
              ) : null}
              {f.postgrad_exam_sessions_total > 0 ? (
                <div className="rounded-xl border border-sky-200/90 bg-sky-50/80 px-3 py-2 sm:col-span-2 lg:col-span-1">
                  <p className="text-[10px] font-bold text-sky-900/80">جلسات جدول (مرحلة عليا)</p>
                  <p className="text-xl font-bold tabular-nums text-sky-950">{formatNum(f.postgrad_exam_sessions_total)}</p>
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        <Section title="المواد الدراسية — آخر التحديثات">
          {f.study_subjects_recent.length === 0 ? (
            <p className="text-sm text-[#64748B]">لا توجد مواد.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-right text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[10px] font-extrabold uppercase text-[#64748B]">
                    <th className="pb-2">المادة</th>
                    <th className="pb-2">التدريسي</th>
                    <th className="pb-2">المرحلة</th>
                    <th className="pb-2">القسم / الفرع</th>
                    <th className="pb-2">النوع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]/90">
                  {f.study_subjects_recent.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 font-semibold text-[#0F172A]">{r.subject_name}</td>
                      <td className="max-w-[200px] py-2 text-[#475569]">
                        {r.instructor_name.trim() ? r.instructor_name : "—"}
                      </td>
                      <td className="py-2 text-[#475569]">
                        {isPostgraduateStudyStageLevel(r.study_stage_level)
                          ? formatCollegeStudyStageLabel(r.study_stage_level)
                          : formatNum(r.study_stage_level)}
                      </td>
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
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2">
              <p className="text-[10px] font-bold text-indigo-900/70">أسماء مشرفين مميّزة</p>
              <p className="text-xl font-bold tabular-nums text-indigo-950">{formatNum(f.supervisors_unique.length)}</p>
            </div>
            <div className="rounded-xl border border-teal-100 bg-teal-50/80 px-3 py-2">
              <p className="text-[10px] font-bold text-teal-900/70">أسماء مراقبين مميّزة</p>
              <p className="text-xl font-bold tabular-nums text-teal-950">{formatNum(f.invigilators_unique.length)}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2">
              <p className="text-[10px] font-bold text-amber-900/70">قاعات بمراقبين مسجّلين</p>
              <p className="text-xl font-bold tabular-nums text-amber-950">{formatNum(f.rooms_with_invigilators)}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            <div className="flex min-h-0 min-w-0 flex-col gap-2">
              <p className="shrink-0 text-xs font-bold leading-tight text-[#475569]">
                أسماء المشرفين (مجمّعة من قاعات التشكيل)
              </p>
              <div className="min-w-0">
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
            </div>
            <div className="flex min-h-0 min-w-0 flex-col gap-2">
              <p className="shrink-0 text-xs font-bold leading-tight text-[#475569]">
                أسماء المراقبين (مجمّعة من قاعات التشكيل)
              </p>
              <div className="min-w-0">
                {f.invigilators_unique.length === 0 ? (
                  <p className="text-sm text-[#94A3B8]">لا توجد أسماء مراقبين مسجّلة في حقول القاعات.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {invShow.map((name) => (
                      <span
                        key={name}
                        className="rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-[#0F766E] ring-1 ring-teal-200/90"
                      >
                        {name}
                      </span>
                    ))}
                    {invMore > 0 ? (
                      <span className="rounded-lg bg-teal-50 px-2 py-1 text-[11px] font-bold text-[#0F766E]">
                        +{formatNum(invMore)}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="الجداول الامتحانية (حسب حالة سير العمل)">
            <div className="mb-3 flex flex-wrap gap-2 text-[11px] font-semibold">
              <Pill tone="slate">إجمالي الجلسات: {formatNum(f.schedules_total)}</Pill>
              <Pill tone="amber">مسودة: {formatNum(f.schedules_draft)}</Pill>
              <Pill tone="emerald">مرفوع: {formatNum(schedulePublishedLikeCalendar)}</Pill>
              <Pill tone="rose">مرفوض: {formatNum(f.schedules_rejected)}</Pill>
            </div>
            <p className="text-xs leading-relaxed text-[#64748B]">
              «مرفوع» هنا بنفس منطق تقويم الكلية: جلسات بحالة معتمد أو مرفوع للمتابعة (الجديدة تُحفظ غالباً معتمدة مباشرة).
              التفصيل: معتمد {formatNum(f.schedules_approved)} · مرفوع للمتابعة فقط {formatNum(f.schedules_submitted)}.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[#64748B]">
              «مكتمل في الجدول» أي خرجت من المسودة: مرفوعة للمتابعة أو معتمدة أو مرفوضة (
              {formatNum(schedulePastDraft)} من {formatNum(f.schedules_total)}).
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

export function FormationsDepartmentsPanel({
  data,
  initialActivityFeed,
}: {
  data: AdminFormationControlRoomData;
  initialActivityFeed: FormationActivityItem[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.formations;
    return data.formations.filter((f) => {
      const schedBlob = f.exam_schedules_detail
        .map(
          (r) =>
            `${r.study_subject_name} ${r.college_subject_name} ${r.room_name} ${r.exam_date} ${r.workflow_status} ${STUDY_TYPE_LABEL_AR[r.study_type]} ${formatCollegeStudyStageLabel(r.stage_level)} ${formatCollegeStudyLevelTierLabel(r.stage_level)}`
        )
        .join(" ");
      const recentBlob = f.study_subjects_recent
        .map((r) => `${r.subject_name} ${r.instructor_name} ${r.linked_branch_name}`)
        .join(" ");
      const blob = [
        f.formation_name ?? "",
        f.owner_username,
        f.departments.map((d) => `${d.branch_name} ${d.branch_head_name}`).join(" "),
        f.branches.map((b) => `${b.branch_name} ${b.branch_head_name}`).join(" "),
        f.supervisors_unique.join(" "),
        f.invigilators_unique.join(" "),
        recentBlob,
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

      <div className="mb-6 space-y-4">
        <FormationActivityFeedCard initialItems={initialActivityFeed} />
        <div className="grid gap-4 sm:grid-cols-2">
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
