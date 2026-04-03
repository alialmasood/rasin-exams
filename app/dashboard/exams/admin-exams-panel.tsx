"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  buildFormationExamSchedulePrintHtml,
  exportFormationExamScheduleExcel,
  formationExportNowLabel,
  printFormationExamScheduleHtml,
  type FormationScheduleExportInput,
} from "@/lib/admin-formation-exam-schedule-export";
import type { AdminCollegeExamScheduleRow } from "@/lib/college-exam-schedules";
import type { StudyType } from "@/lib/college-study-subjects";
import {
  formatCollegeStudyLevelTierLabel,
  formatCollegeStudyStageLabel,
  formatExamScheduleStudyLevelSummary,
  isPostgraduateStudyStageLevel,
} from "@/lib/college-study-stage-display";
import { formatExamMealSlotLabel } from "@/lib/exam-meal-slot";
import { STUDY_TYPE_LABEL_AR } from "@/lib/study-type-labels-ar";
import { groupExamScheduleRowsIntoSessions } from "@/lib/exam-schedule-logical-group";
import { fetchAdminExamSchedulesAction } from "./actions";

const REFRESH_MS = 20_000;

const SCHEDULE_TYPE_TABLE_SHORT = { FINAL: "نهائي", SEMESTER: "فصلي" } as const;

const WORKFLOW_LABEL = {
  DRAFT: "مسودة",
  SUBMITTED: "مُرسَل / معتمد",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
} as const;

function formatDuration(minutes: number) {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} س و${m} د`;
  if (h > 0) return h === 1 ? "ساعة" : `${h} ساعات`;
  return `${m} د`;
}

function weekdayAr(dateIso: string) {
  if (!dateIso) return "";
  return new Intl.DateTimeFormat("ar-IQ", { weekday: "long" }).format(new Date(dateIso));
}

function timeRangeLabel(start: string, end: string) {
  return `${start || "--:--"} – ${end || "--:--"}`;
}

function sortSchedules<T extends { exam_date: string; start_time: string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const da = `${a.exam_date} ${a.start_time}`;
    const db = `${b.exam_date} ${b.start_time}`;
    return da.localeCompare(db);
  });
}

function workflowBadgeClass(st: AdminCollegeExamScheduleRow["workflow_status"]) {
  if (st === "APPROVED" || st === "SUBMITTED") return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  if (st === "REJECTED") return "bg-red-100 text-red-900 ring-red-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function SessionStudyLevelCell({ stageLevel, studyType }: { stageLevel: number; studyType: StudyType }) {
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

type DeptBlock = {
  deptId: string;
  deptName: string;
  sessions: AdminCollegeExamScheduleRow[][];
};

type FormationBlock = {
  ownerId: string;
  formationLabel: string;
  ownerUsername: string;
  sessionCount: number;
  finalizedSessions: number;
  wf: { draft: number; submitted: number; approved: number; rejected: number };
  departments: DeptBlock[];
};

function buildFormationBlocks(rows: AdminCollegeExamScheduleRow[]): FormationBlock[] {
  const byOwner = new Map<string, AdminCollegeExamScheduleRow[]>();
  const order: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!byOwner.has(r.owner_user_id)) byOwner.set(r.owner_user_id, []);
    byOwner.get(r.owner_user_id)!.push(r);
    if (!seen.has(r.owner_user_id)) {
      order.push(r.owner_user_id);
      seen.add(r.owner_user_id);
    }
  }

  return order.map((ownerId) => {
    const list = sortSchedules(byOwner.get(ownerId)!);
    const first = list[0]!;
    const allSessions = groupExamScheduleRowsIntoSessions(list);
    const wf = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
    let finalizedSessions = 0;
    for (const s of allSessions) {
      const st = s[0]!.workflow_status;
      if (st === "DRAFT") wf.draft++;
      else if (st === "SUBMITTED") {
        wf.submitted++;
        finalizedSessions++;
      } else if (st === "APPROVED") {
        wf.approved++;
        finalizedSessions++;
      } else wf.rejected++;
    }

    const deptMap = new Map<string, AdminCollegeExamScheduleRow[]>();
    const deptOrder: string[] = [];
    for (const r of list) {
      if (!deptMap.has(r.college_subject_id)) {
        deptMap.set(r.college_subject_id, []);
        deptOrder.push(r.college_subject_id);
      }
      deptMap.get(r.college_subject_id)!.push(r);
    }
    const departments: DeptBlock[] = deptOrder.map((deptId) => {
      const dr = sortSchedules(deptMap.get(deptId)!);
      return {
        deptId,
        deptName: dr[0]!.college_subject_name,
        sessions: groupExamScheduleRowsIntoSessions(dr),
      };
    });
    departments.sort((a, b) => a.deptName.localeCompare(b.deptName, "ar"));

    return {
      ownerId,
      formationLabel: first.formation_label,
      ownerUsername: first.owner_username,
      sessionCount: allSessions.length,
      finalizedSessions,
      wf,
      departments,
    };
  });
}

function formationBlockToExportInput(b: FormationBlock): FormationScheduleExportInput {
  return {
    formationLabel: b.formationLabel,
    ownerUsername: b.ownerUsername,
    departments: b.departments.map((d) => ({
      deptName: d.deptName,
      sessions: d.sessions,
    })),
  };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span className={`inline-flex shrink-0 text-[#64748B] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function SessionsTable({ sessions }: { sessions: AdminCollegeExamScheduleRow[][] }) {
  if (sessions.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-[#64748B]">لا توجد جلسات في هذا القسم.</p>;
  }
  let seq = 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[940px] table-fixed border-collapse text-right">
        <thead className="bg-[#F1F5F9]">
          <tr className="border-b border-[#E2E8F0]">
            <th className="px-2 py-2 text-center text-xs font-bold text-[#334155] sm:text-sm">#</th>
            <th className="px-2 py-2 text-xs font-bold text-[#334155] sm:text-sm">نوع الجدول</th>
            <th className="px-2 py-2 text-xs font-bold text-[#334155] sm:text-sm">المادة</th>
            <th className="px-2 py-2 text-xs font-bold text-[#334155] sm:text-sm">المستوى الدراسي</th>
            <th className="px-2 py-2 text-center text-xs font-bold text-[#334155] sm:text-sm">التاريخ</th>
            <th className="px-2 py-2 text-center text-xs font-bold text-[#334155] sm:text-sm">الوجبة</th>
            <th className="px-2 py-2 text-xs font-bold text-[#334155] sm:text-sm">اليوم</th>
            <th className="px-2 py-2 text-center text-xs font-bold text-[#334155] sm:text-sm">الوقت</th>
            <th className="px-2 py-2 text-center text-xs font-bold text-[#334155] sm:text-sm">المدة</th>
            <th className="px-2 py-2 text-xs font-bold text-[#334155] sm:text-sm">القاعة</th>
            <th className="px-2 py-2 text-xs font-bold text-[#334155] sm:text-sm">عام / فصل</th>
            <th className="px-2 py-2 text-center text-xs font-bold text-[#334155] sm:text-sm">الحالة</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E2E8F0] bg-white">
          {sessions.map((sess) => {
            seq += 1;
            const r = sess[0]!;
            const multi = sess.length > 1;
            const st = r.workflow_status;
            return (
              <tr key={sess.map((x) => x.id).join("|")} className={`hover:bg-[#F8FAFC] ${multi ? "bg-indigo-50/15" : ""}`}>
                <td className="px-2 py-2 text-center text-[11px] tabular-nums text-[#334155]">{seq}</td>
                <td className="px-2 py-2 text-[11px] text-[#334155]">{SCHEDULE_TYPE_TABLE_SHORT[r.schedule_type]}</td>
                <td className="max-w-0 px-2 py-2 break-words text-[11px] font-semibold text-[#0F172A]">
                  <div>{r.study_subject_name}</div>
                  {multi ? (
                    <span className="mt-0.5 inline-flex rounded-full bg-[#4F46E5]/12 px-1.5 py-0.5 text-[9px] font-bold text-[#3730A3]">
                      جلسة واحدة — {sess.length} قاعات
                    </span>
                  ) : null}
                </td>
                <td className="align-top px-2 py-2">
                  <SessionStudyLevelCell stageLevel={r.stage_level} studyType={r.study_type} />
                </td>
                <td className="px-2 py-2 text-center text-[11px] tabular-nums text-[#334155]">{r.exam_date}</td>
                <td className="px-2 py-2 text-center text-[10px] font-semibold text-[#475569]">
                  {formatExamMealSlotLabel(r.meal_slot)}
                </td>
                <td className="max-w-0 px-2 py-2 break-words text-[11px] text-[#334155]">{weekdayAr(r.exam_date)}</td>
                <td className="px-2 py-2 text-center text-[11px] tabular-nums text-[#334155]">{timeRangeLabel(r.start_time, r.end_time)}</td>
                <td className="px-2 py-2 text-center text-[11px] text-[#334155]">{formatDuration(r.duration_minutes)}</td>
                <td className="max-w-0 px-2 py-2 break-words text-[11px] text-[#334155]">
                  {multi ? (
                    <ul className="list-disc space-y-0.5 pe-3 text-[10px] leading-snug">
                      {sess.map((m) => (
                        <li key={m.id}>{m.room_name}</li>
                      ))}
                    </ul>
                  ) : (
                    r.room_name
                  )}
                </td>
                <td className="max-w-0 px-2 py-2 break-words text-[10px] leading-snug text-[#475569]">
                  {r.academic_year || "—"}
                  <span className="text-[#94A3B8]"> · </span>
                  {r.term_label || "—"}
                </td>
                <td className="px-2 py-2 text-center">
                  <span className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold ring-1 ${workflowBadgeClass(st)}`}>
                    {WORKFLOW_LABEL[st]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Props = { initialRows: AdminCollegeExamScheduleRow[] };

export function AdminExamsPanel({ initialRows }: Props) {
  const [rows, setRows] = useState<AdminCollegeExamScheduleRow[]>(initialRows);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "finalized">("finalized");
  const [openFormations, setOpenFormations] = useState<Set<string>>(() => new Set());
  const [openDepts, setOpenDepts] = useState<Set<string>>(() => new Set());
  const [exportBusyOwnerId, setExportBusyOwnerId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const res = await fetchAdminExamSchedulesAction();
      if (!res.ok) {
        setError(res.error ?? "تعذّر التحديث");
        return;
      }
      setError(null);
      setRows(res.rows);
      setLastRefresh(new Date());
    });
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(refresh, REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.formation_label,
        r.owner_username,
        r.college_subject_name,
        r.study_subject_name,
        r.room_name,
        r.exam_date,
        r.academic_year ?? "",
        r.term_label ?? "",
        formatExamScheduleStudyLevelSummary(r.stage_level, r.study_type),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const blocks = useMemo(() => buildFormationBlocks(filteredRows), [filteredRows]);

  const visibleBlocks = useMemo(() => {
    if (filterMode === "all") return blocks;
    return blocks.filter((b) => b.finalizedSessions > 0);
  }, [blocks, filterMode]);

  const totals = useMemo(() => {
    let sessions = 0;
    let fin = 0;
    for (const b of blocks) {
      sessions += b.sessionCount;
      fin += b.finalizedSessions;
    }
    return { formations: blocks.length, sessions, finalizedSessions: fin };
  }, [blocks]);

  const toggleFormation = (id: string) => {
    setOpenFormations((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleDept = (key: string) => {
    setOpenDepts((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const formatTime = (d: Date) =>
    new Intl.DateTimeFormat("ar-IQ", { dateStyle: "short", timeStyle: "medium" }).format(d);

  const onExportFormationPdf = useCallback((b: FormationBlock) => {
    setExportBusyOwnerId(b.ownerId);
    try {
      const html = buildFormationExamSchedulePrintHtml(
        formationBlockToExportInput(b),
        formationExportNowLabel()
      );
      if (!printFormationExamScheduleHtml(html)) {
        window.alert("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");
      }
    } finally {
      setExportBusyOwnerId(null);
    }
  }, []);

  const onExportFormationExcel = useCallback(async (b: FormationBlock) => {
    setExportBusyOwnerId(b.ownerId);
    try {
      const day = new Date().toISOString().slice(0, 10);
      const base = `جدول-امتحاني-${b.ownerUsername}-${day}`;
      await exportFormationExamScheduleExcel(formationBlockToExportInput(b), base);
    } catch {
      window.alert("تعذر تصدير ملف Excel. أعد المحاولة.");
    } finally {
      setExportBusyOwnerId(null);
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6" dir="rtl">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">متابعة الجداول الامتحانية</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            نفس بيانات صفحة جدول الكلية لكل تشكيل، مجمّعة هنا للمتابعة: تشكيل ← قسم ← جلسات (مع دمج القاعات عند التوزيع). تحديث تلقائي كل{" "}
            {REFRESH_MS / 1000} ثانية.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#64748B]">
            آخر جلب: {formatTime(lastRefresh)}
            {pending ? " — جاري التحديث…" : ""}
          </span>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={pending}
            className="rounded-xl border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] shadow-sm transition hover:bg-[#F8FAFC] disabled:opacity-60"
          >
            تحديث الآن
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="admin-exams-search" className="mb-1 block text-xs font-semibold text-[#475569]">
            بحث في التشكيل، القسم، المادة، التاريخ…
          </label>
          <input
            id="admin-exams-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث…"
            className="h-10 w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
          />
        </div>
        <div>
          <span className="mb-1 block text-xs font-semibold text-[#475569]">عرض التشكيلات</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilterMode("finalized")}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                filterMode === "finalized"
                  ? "bg-[#1E3A8A] text-white shadow"
                  : "border border-[#CBD5E1] bg-white text-[#334155] hover:bg-white"
              }`}
            >
              ذات جداول مكتملة (معتمد / مُرسَل)
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                filterMode === "all"
                  ? "bg-[#1E3A8A] text-white shadow"
                  : "border border-[#CBD5E1] bg-white text-[#334155] hover:bg-white"
              }`}
            >
              الكل (بما فيها المسودات)
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold text-[#64748B]">تشكيلات ضمن البحث</p>
          <p className="mt-1 text-2xl font-extrabold text-[#0F172A]">{totals.formations}</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold text-[#64748B]">إجمالي الجلسات (منطقياً)</p>
          <p className="mt-1 text-2xl font-extrabold text-[#0F172A]">{totals.sessions}</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold text-[#64748B]">جلسات معتمدة أو مُرسَلة</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-800">{totals.finalizedSessions}</p>
        </div>
      </div>

      {visibleBlocks.length === 0 ? (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-14 text-center text-sm text-[#64748B] shadow-sm">
          {filterMode === "finalized"
            ? "لا توجد تشكيلات تطابق البحث ولديها جداول مكتملة (معتمد / مُرسَل). جرّب «الكل» أو أفرغ البحث."
            : "لا توجد جداول امتحانية مسجّلة من حسابات الكلية ضمن البحث الحالي."}
        </div>
      ) : (
        <ul className="flex list-none flex-col gap-3 p-0">
          {visibleBlocks.map((b) => {
            const fOpen = openFormations.has(b.ownerId);
            return (
              <li key={b.ownerId} className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
                <div className="flex flex-col gap-3 bg-gradient-to-l from-[#EEF2FF] to-white px-4 py-4 sm:flex-row sm:items-start sm:gap-2">
                  <button
                    type="button"
                    onClick={() => toggleFormation(b.ownerId)}
                    aria-expanded={fOpen}
                    className="flex min-w-0 flex-1 items-start gap-3 rounded-xl border-0 bg-transparent py-0 text-right transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6]"
                  >
                    <Chevron open={fOpen} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-bold text-[#0F172A]">{b.formationLabel}</span>
                      <span className="mt-0.5 block text-xs text-[#64748B]">@{b.ownerUsername}</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1E3A8A] ring-1 ring-[#C7D2FE]">
                          {b.sessionCount} جلسة
                        </span>
                        <span className="inline-flex rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200">
                          مكتمل: {b.finalizedSessions}
                        </span>
                        {b.wf.draft > 0 ? (
                          <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                            مسودة: {b.wf.draft}
                          </span>
                        ) : null}
                        {b.wf.rejected > 0 ? (
                          <span className="inline-flex rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-800">
                            مرفوض: {b.wf.rejected}
                          </span>
                        ) : null}
                        <span className="inline-flex rounded-lg bg-white px-2.5 py-1 text-[11px] text-[#64748B] ring-1 ring-[#E2E8F0]">
                          {b.departments.length} قسم / فرع
                        </span>
                      </div>
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#C7D2FE]/60 pt-3 sm:border-t-0 sm:pt-0 sm:ps-1">
                    <button
                      type="button"
                      disabled={exportBusyOwnerId === b.ownerId}
                      onClick={() => onExportFormationPdf(b)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#1E3A8A]/35 bg-white px-3 py-2 text-xs font-bold text-[#1E3A8A] shadow-sm transition hover:bg-[#EFF6FF] disabled:opacity-50"
                      title="فتح نافذة للطباعة أو الحفظ كملف PDF — كل قسم في قسم منفصل"
                    >
                      <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"
                        />
                      </svg>
                      {exportBusyOwnerId === b.ownerId ? "جاري…" : "تحميل PDF"}
                    </button>
                    <button
                      type="button"
                      disabled={exportBusyOwnerId === b.ownerId}
                      onClick={() => void onExportFormationExcel(b)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-700/25 bg-white px-3 py-2 text-xs font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-50 disabled:opacity-50"
                      title="ملف Excel — ورقة لكل قسم/فرع بمعزل عن الآخر"
                    >
                      <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                        />
                      </svg>
                      {exportBusyOwnerId === b.ownerId ? "جاري التحميل…" : "تحميل Excel"}
                    </button>
                  </div>
                </div>
                {fOpen ? (
                  <div className="border-t border-[#E2E8F0] bg-[#FAFBFF] px-3 py-3">
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {b.departments.map((d) => {
                        const dk = `${b.ownerId}:${d.deptId}`;
                        const dOpen = openDepts.has(dk);
                        return (
                          <li key={dk} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
                            <button
                              type="button"
                              onClick={() => toggleDept(dk)}
                              aria-expanded={dOpen}
                              className="flex w-full items-center gap-3 border-0 bg-[#F8FAFC] px-3 py-3 text-right transition hover:bg-[#F1F5F9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3B82F6]"
                            >
                              <Chevron open={dOpen} />
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold text-[#1E293B]">القسم / الفرع: {d.deptName}</span>
                                <span className="mt-0.5 block text-[11px] text-[#64748B]">{d.sessions.length} جلسة امتحانية</span>
                              </span>
                            </button>
                            {dOpen ? (
                              <div className="border-t border-[#E2E8F0] px-1 pb-3 pt-2">
                                <SessionsTable sessions={d.sessions} />
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
