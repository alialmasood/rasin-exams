"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { AdminExamParticipationRow } from "@/lib/admin-exam-participation-report";
import {
  buildParticipationReportPrintHtml,
  exportParticipationExcel,
  participationExportNowLabel,
  printParticipationReportHtml,
  type ParticipationExcelDeptBlock,
  type ParticipationExcelRow,
} from "@/lib/admin-exam-participation-export";
import { groupExamScheduleRowsIntoSessions } from "@/lib/exam-schedule-logical-group";
import { fetchAdminExamParticipationAction } from "./actions";

const REFRESH_MS = 20_000;

const SCHEDULE_TYPE_SHORT = { FINAL: "نهائي", SEMESTER: "فصلي" } as const;

const WORKFLOW_LABEL = {
  DRAFT: "مسودة",
  SUBMITTED: "مُرسَل",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
} as const;

function weekdayAr(dateIso: string) {
  if (!dateIso) return "";
  return new Intl.DateTimeFormat("ar-IQ", { weekday: "long" }).format(new Date(dateIso));
}

function timeRangeLabel(start: string, end: string) {
  return `${start || "--:--"} – ${end || "--:--"}`;
}

function formatDuration(minutes: number) {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} س و${m} د`;
  if (h > 0) return h === 1 ? "ساعة" : `${h} ساعات`;
  return `${m} د`;
}

function sortRows(rows: AdminExamParticipationRow[]) {
  return [...rows].sort((a, b) => {
    const da = `${a.exam_date} ${a.start_time}`;
    const db = `${b.exam_date} ${b.start_time}`;
    return da.localeCompare(db);
  });
}

function splitAbsenceNames(s: string): string[] {
  return s.split(/[،,;]/).map((x) => x.trim()).filter(Boolean);
}

type AggregatedSession = {
  workflow_status: AdminExamParticipationRow["workflow_status"];
  schedule_type: AdminExamParticipationRow["schedule_type"];
  study_subject_name: string;
  stage_level: number;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  room_names: string[];
  capacity_total: number;
  attendance_count: number;
  absence_count: number;
  absence_names: string | null;
  academic_year: string | null;
  term_label: string | null;
};

function aggregateSession(sess: AdminExamParticipationRow[]): AggregatedSession {
  const r0 = sess[0]!;
  let capacity_total = 0;
  let attendance_count = 0;
  let absence_count = 0;
  const nameSet = new Set<string>();
  const room_names: string[] = [];
  for (const r of sess) {
    capacity_total += r.capacity_total;
    attendance_count += r.attendance_count;
    absence_count += r.absence_count;
    room_names.push(r.room_name);
    if (r.absence_names) for (const n of splitAbsenceNames(r.absence_names)) nameSet.add(n);
  }
  return {
    workflow_status: r0.workflow_status,
    schedule_type: r0.schedule_type,
    study_subject_name: r0.study_subject_name,
    stage_level: r0.stage_level,
    start_time: r0.start_time,
    end_time: r0.end_time,
    duration_minutes: r0.duration_minutes,
    room_names,
    capacity_total,
    attendance_count,
    absence_count,
    absence_names: nameSet.size ? [...nameSet].sort((a, b) => a.localeCompare(b, "ar")).join("، ") : null,
    academic_year: r0.academic_year,
    term_label: r0.term_label,
  };
}

type DeptDayBlock = {
  deptId: string;
  deptName: string;
  sessions: AggregatedSession[];
  totals: { capacity: number; present: number; absent: number };
};

type DateBlock = {
  examDate: string;
  departments: DeptDayBlock[];
  totals: { capacity: number; present: number; absent: number };
};

type FormationBlock = {
  ownerId: string;
  formationLabel: string;
  ownerUsername: string;
  dates: DateBlock[];
};

function sessionToExcelRow(seq: number, examDate: string, s: AggregatedSession): ParticipationExcelRow {
  return {
    "#": seq,
    التاريخ: examDate,
    اليوم: weekdayAr(examDate),
    المادة: s.study_subject_name,
    مرحلة: s.stage_level,
    الوقت: timeRangeLabel(s.start_time, s.end_time),
    المدة: formatDuration(s.duration_minutes),
    القاعة: s.room_names.length <= 1 ? (s.room_names[0] ?? "—") : s.room_names.join("؛ "),
    مقاعد: s.capacity_total,
    حضور: s.attendance_count,
    غياب: s.absence_count,
    "أسماء الغائبين": s.absence_names ?? "—",
    نوع: SCHEDULE_TYPE_SHORT[s.schedule_type],
    "عام دراسي": s.academic_year ?? "—",
    فصل: s.term_label ?? "—",
    "حالة الجدول": WORKFLOW_LABEL[s.workflow_status],
    "عدد قاعات الجلسة": s.room_names.length,
  };
}

function buildParticipationExcelDepartments(dates: DateBlock[]): ParticipationExcelDeptBlock[] {
  type Pair = { examDate: string; s: AggregatedSession };
  const byDept = new Map<string, { deptName: string; raw: Pair[] }>();
  for (const d of dates) {
    for (const dep of d.departments) {
      if (!byDept.has(dep.deptId)) byDept.set(dep.deptId, { deptName: dep.deptName, raw: [] });
      for (const s of dep.sessions) {
        byDept.get(dep.deptId)!.raw.push({ examDate: d.examDate, s });
      }
    }
  }
  const out: ParticipationExcelDeptBlock[] = [];
  for (const { deptName, raw } of byDept.values()) {
    if (raw.length === 0) continue;
    raw.sort((a, b) => {
      const c = a.examDate.localeCompare(b.examDate);
      if (c !== 0) return c;
      return a.s.start_time.localeCompare(b.s.start_time);
    });
    out.push({
      deptName,
      rows: raw.map((item, i) => sessionToExcelRow(i + 1, item.examDate, item.s)),
    });
  }
  out.sort((a, b) => a.deptName.localeCompare(b.deptName, "ar"));
  return out;
}

function buildFormationBlocks(rows: AdminExamParticipationRow[]): FormationBlock[] {
  const byOwner = new Map<string, AdminExamParticipationRow[]>();
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
    const list = sortRows(byOwner.get(ownerId)!);
    const first = list[0]!;
    const sessionLike = list.map((r) => ({ ...r, id: r.schedule_id }));
    const sessions = groupExamScheduleRowsIntoSessions(sessionLike);

    const dateOrder = [...new Set(sessions.map((s) => s[0]!.exam_date))].sort((a, b) => a.localeCompare(b));

    const dates: DateBlock[] = dateOrder.map((examDate) => {
      const daySessions = sessions.filter((s) => s[0]!.exam_date === examDate);
      const byDept = new Map<string, typeof daySessions>();
      const deptOrder: string[] = [];
      for (const sess of daySessions) {
        const deptId = sess[0]!.college_subject_id;
        if (!byDept.has(deptId)) {
          byDept.set(deptId, []);
          deptOrder.push(deptId);
        }
        byDept.get(deptId)!.push(sess);
      }

      let dayCap = 0;
      let dayPres = 0;
      let dayAbs = 0;

      const departments: DeptDayBlock[] = deptOrder.map((deptId) => {
        const sessList = byDept.get(deptId)!;
        sessList.sort((a, b) => {
          const ra = a[0]!;
          const rb = b[0]!;
          const c = ra.start_time.localeCompare(rb.start_time);
          if (c !== 0) return c;
          return ra.study_subject_name.localeCompare(rb.study_subject_name, "ar");
        });
        const aggSessions = sessList.map((s) => aggregateSession(s));
        let capacity = 0;
        let present = 0;
        let absent = 0;
        for (const s of aggSessions) {
          capacity += s.capacity_total;
          present += s.attendance_count;
          absent += s.absence_count;
        }
        dayCap += capacity;
        dayPres += present;
        dayAbs += absent;
        return {
          deptId,
          deptName: sessList[0]![0]!.college_subject_name,
          sessions: aggSessions,
          totals: { capacity, present, absent },
        };
      });
      departments.sort((a, b) => a.deptName.localeCompare(b.deptName, "ar"));

      return {
        examDate,
        departments,
        totals: { capacity: dayCap, present: dayPres, absent: dayAbs },
      };
    });

    return {
      ownerId,
      formationLabel: first.formation_label,
      ownerUsername: first.owner_username,
      dates,
    };
  });
}

function workflowBadgeClass(st: AdminExamParticipationRow["workflow_status"]) {
  if (st === "APPROVED" || st === "SUBMITTED") return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  if (st === "REJECTED") return "bg-red-100 text-red-900 ring-red-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
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

function TotalsStrip({ label, capacity, present, absent }: { label: string; capacity: number; present: number; absent: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[12px] text-[#475569]">
      <span className="font-bold text-[#334155]">{label}</span>
      <span className="tabular-nums">
        مقاعد: <strong className="text-[#0F172A]">{capacity}</strong>
      </span>
      <span className="text-[#94A3B8]">·</span>
      <span className="tabular-nums text-emerald-800">
        حضور: <strong>{present}</strong>
      </span>
      <span className="text-[#94A3B8]">·</span>
      <span className="tabular-nums text-amber-900">
        غياب: <strong>{absent}</strong>
      </span>
    </div>
  );
}

type Props = { initialRows: AdminExamParticipationRow[] };

export function AdminStudentsParticipationPanel({ initialRows }: Props) {
  const [rows, setRows] = useState<AdminExamParticipationRow[]>(initialRows);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [openFormations, setOpenFormations] = useState<Set<string>>(() => new Set());
  const [openDates, setOpenDates] = useState<Set<string>>(() => new Set());
  const [openDepts, setOpenDepts] = useState<Set<string>>(() => new Set());
  const [exportBusyKey, setExportBusyKey] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const res = await fetchAdminExamParticipationAction();
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
        r.absence_names ?? "",
        r.academic_year ?? "",
        r.term_label ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const blocks = useMemo(() => buildFormationBlocks(filteredRows), [filteredRows]);

  const stats = useMemo(() => {
    let formations = blocks.length;
    let sessions = 0;
    let cap = 0;
    let pres = 0;
    let abs = 0;
    for (const b of blocks) {
      for (const d of b.dates) {
        for (const dep of d.departments) {
          sessions += dep.sessions.length;
          cap += dep.totals.capacity;
          pres += dep.totals.present;
          abs += dep.totals.absent;
        }
      }
    }
    return { formations, sessions, cap, pres, abs };
  }, [blocks]);

  const toggleFormation = (id: string) => {
    setOpenFormations((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleDate = (key: string) => {
    setOpenDates((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
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

  const onExportFormationAllDays = useCallback(async (b: FormationBlock) => {
    const key = `${b.ownerId}|all-xlsx`;
    setExportBusyKey(key);
    try {
      const departments = buildParticipationExcelDepartments(b.dates);
      await exportParticipationExcel({
        formationLabel: b.formationLabel,
        ownerUsername: b.ownerUsername,
        scopeSlug: `all-${b.dates.length}-days`,
        departments,
      });
    } catch {
      window.alert("تعذر تصدير ملف Excel. أعد المحاولة.");
    } finally {
      setExportBusyKey(null);
    }
  }, []);

  const onExportFormationAllDaysPdf = useCallback((b: FormationBlock) => {
    const key = `${b.ownerId}|all-pdf`;
    setExportBusyKey(key);
    try {
      const departments = buildParticipationExcelDepartments(b.dates);
      const html = buildParticipationReportPrintHtml(
        {
          formationLabel: b.formationLabel,
          ownerUsername: b.ownerUsername,
          scopeSlug: `all-${b.dates.length}-days`,
          departments,
          scopeTitleAr: `جميع أيام الامتحان — ${b.dates.length} يوم`,
        },
        participationExportNowLabel()
      );
      const ok = printParticipationReportHtml(html);
      if (!ok) window.alert("تعذّر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة أو جرّب متصفحاً آخر.");
    } finally {
      setExportBusyKey(null);
    }
  }, []);

  const onExportFormationDay = useCallback(async (b: FormationBlock, d: DateBlock) => {
    const key = `${b.ownerId}|day-xlsx|${d.examDate}`;
    setExportBusyKey(key);
    try {
      const departments = buildParticipationExcelDepartments([d]);
      await exportParticipationExcel({
        formationLabel: b.formationLabel,
        ownerUsername: b.ownerUsername,
        scopeSlug: `day-${d.examDate}`,
        departments,
      });
    } catch {
      window.alert("تعذر تصدير ملف Excel. أعد المحاولة.");
    } finally {
      setExportBusyKey(null);
    }
  }, []);

  const onExportFormationDayPdf = useCallback((b: FormationBlock, d: DateBlock) => {
    const key = `${b.ownerId}|day-pdf|${d.examDate}`;
    setExportBusyKey(key);
    try {
      const departments = buildParticipationExcelDepartments([d]);
      const html = buildParticipationReportPrintHtml(
        {
          formationLabel: b.formationLabel,
          ownerUsername: b.ownerUsername,
          scopeSlug: `day-${d.examDate}`,
          departments,
          scopeTitleAr: `يوم الامتحان: ${d.examDate} (${weekdayAr(d.examDate)})`,
        },
        participationExportNowLabel()
      );
      const ok = printParticipationReportHtml(html);
      if (!ok) window.alert("تعذّر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة أو جرّب متصفحاً آخر.");
    } finally {
      setExportBusyKey(null);
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-[#0F172A]">مشاركة الطلبة في الامتحان</h1>
        <p className="text-base text-[#64748B]">
          عرض منظم حسب التشكيل، ثم اليوم الامتحاني، ثم القسم (الفرع). لكل جلسة: المقاعد، الحضور، الغياب، وأسماء الغائبين عند
          التوفر. التصدير: Excel أو PDF رسمي (A4 أفقي) ليوم محدد أو لجميع أيام التشكيل.
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1">
          <label htmlFor="participation-search" className="mb-1 block text-sm font-bold text-[#475569]">
            بحث
          </label>
          <input
            id="participation-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="تشكيل، قسم، مادة، قاعة، تاريخ، اسم غائب…"
            className="w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-base text-[#0F172A] outline-none ring-[#4F46E5]/25 focus:border-[#4F46E5] focus:ring-2"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#64748B]">
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="rounded-lg bg-[#4F46E5] px-3 py-2 text-sm font-bold text-white shadow hover:bg-[#4338CA] disabled:opacity-60"
          >
            {pending ? "جاري التحديث…" : "تحديث الآن"}
          </button>
          <span className="tabular-nums">
            آخر تحديث: {lastRefresh.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-base text-red-900">{error}</div>
      ) : null}

      <div className="flex flex-wrap gap-3 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9]/60 px-3 py-2 text-[12px] text-[#475569]">
        <span>
          تشكيلات: <strong className="text-[#0F172A]">{stats.formations}</strong>
        </span>
        <span className="text-[#CBD5E1]">|</span>
        <span>
          جلسات (مجمّعة): <strong className="text-[#0F172A]">{stats.sessions}</strong>
        </span>
        <span className="text-[#CBD5E1]">|</span>
        <span className="tabular-nums">
          إجمالي مقاعد: <strong>{stats.cap}</strong>
        </span>
        <span className="tabular-nums text-emerald-800">
          حضور: <strong>{stats.pres}</strong>
        </span>
        <span className="tabular-nums text-amber-900">
          غياب: <strong>{stats.abs}</strong>
        </span>
      </div>

      {blocks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#CBD5E1] bg-white px-4 py-10 text-center text-base text-[#64748B]">
          لا توجد بيانات جداول امتحانية لعرضها، أو لا يطابق البحث أي نتيجة.
        </p>
      ) : (
        <ul className="space-y-3">
          {blocks.map((b) => {
            const fOpen = openFormations.has(b.ownerId);
            return (
              <li key={b.ownerId} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
                <div className="flex flex-col gap-2 bg-[#F8FAFC] px-4 py-3 sm:flex-row sm:items-start sm:gap-2">
                  <button
                    type="button"
                    onClick={() => toggleFormation(b.ownerId)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border-0 bg-transparent py-0 text-right hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-bold text-[#0F172A]">{b.formationLabel}</div>
                      <div className="mt-0.5 text-[12px] text-[#64748B]">
                        حساب: {b.ownerUsername} · {b.dates.length} يوم امتحاني
                      </div>
                    </div>
                    <Chevron open={fOpen} />
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#E2E8F0] pt-2 sm:border-t-0 sm:pt-0 sm:ps-1">
                    <button
                      type="button"
                      disabled={exportBusyKey === `${b.ownerId}|all-pdf`}
                      onClick={() => onExportFormationAllDaysPdf(b)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#1E3A8A]/35 bg-white px-3 py-2 text-sm font-bold text-[#1E3A8A] shadow-sm transition hover:bg-[#EFF6FF] disabled:opacity-50"
                      title="تقرير PDF رسمي — A4 أفقي — كل أيام الامتحان"
                    >
                      <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"
                        />
                      </svg>
                      {exportBusyKey === `${b.ownerId}|all-pdf` ? "جاري…" : "PDF — كل الأيام"}
                    </button>
                    <button
                      type="button"
                      disabled={exportBusyKey === `${b.ownerId}|all-xlsx`}
                      onClick={() => void onExportFormationAllDays(b)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-700/25 bg-white px-3 py-2 text-sm font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-50 disabled:opacity-50"
                      title="ملف Excel — كل أيام الامتحان، ورقة لكل قسم"
                    >
                      <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                        />
                      </svg>
                      {exportBusyKey === `${b.ownerId}|all-xlsx` ? "جاري التحميل…" : "Excel — كل الأيام"}
                    </button>
                  </div>
                </div>

                {fOpen ? (
                  <div className="border-t border-[#E2E8F0]">
                    {b.dates.map((d) => {
                      const dk = `${b.ownerId}|${d.examDate}`;
                      const dOpen = openDates.has(dk);
                      return (
                        <div key={dk} className="border-b border-[#E2E8F0] last:border-b-0">
                          <div className="flex flex-col gap-2 bg-white px-4 py-2.5 sm:flex-row sm:items-center sm:gap-2">
                            <button
                              type="button"
                              onClick={() => toggleDate(dk)}
                              className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border-0 bg-transparent py-0 text-right hover:bg-[#FAFBFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3B82F6]"
                            >
                              <div>
                                <div className="text-base font-bold text-[#1E293B]">
                                  {d.examDate}{" "}
                                  <span className="font-normal text-[#64748B]">({weekdayAr(d.examDate)})</span>
                                </div>
                                <div className="text-[11px] text-[#94A3B8]">
                                  {d.departments.length} قسم · {d.departments.reduce((n, x) => n + x.sessions.length, 0)} جلسة
                                </div>
                              </div>
                              <Chevron open={dOpen} />
                            </button>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={exportBusyKey === `${b.ownerId}|day-pdf|${d.examDate}`}
                                onClick={() => onExportFormationDayPdf(b, d)}
                                className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#1E3A8A]/35 bg-white px-2.5 py-2 text-[11px] font-bold text-[#1E3A8A] shadow-sm transition hover:bg-[#EFF6FF] disabled:opacity-50"
                                title="تقرير PDF رسمي — A4 أفقي — هذا اليوم فقط"
                              >
                                <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"
                                  />
                                </svg>
                                PDF
                              </button>
                              <button
                                type="button"
                                disabled={exportBusyKey === `${b.ownerId}|day-xlsx|${d.examDate}`}
                                onClick={() => void onExportFormationDay(b, d)}
                                className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-700/30 bg-white px-2.5 py-2 text-[11px] font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-50 disabled:opacity-50"
                                title="ملف Excel — هذا اليوم فقط"
                              >
                                <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                                  />
                                </svg>
                                Excel
                              </button>
                            </div>
                          </div>
                          {dOpen ? (
                            <div className="space-y-2 px-2 pb-3">
                              <TotalsStrip label="ملخص اليوم" capacity={d.totals.capacity} present={d.totals.present} absent={d.totals.absent} />
                              {d.departments.map((dep) => {
                                const depKey = `${dk}|${dep.deptId}`;
                                const depOpen = openDepts.has(depKey);
                                return (
                                  <div key={depKey} className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-[#FAFBFC]">
                                    <button
                                      type="button"
                                      onClick={() => toggleDept(depKey)}
                                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right hover:bg-[#F1F5F9]"
                                    >
                                      <div>
                                        <div className="text-sm font-bold text-[#334155]">{dep.deptName}</div>
                                        <div className="text-[11px] text-[#64748B]">{dep.sessions.length} جلسة</div>
                                      </div>
                                      <Chevron open={depOpen} />
                                    </button>
                                    {depOpen ? (
                                      <>
                                        <div className="overflow-x-auto border-t border-[#E2E8F0] bg-white">
                                          <table className="w-full min-w-[720px] table-fixed border-collapse text-right">
                                            <thead className="bg-[#F1F5F9]">
                                              <tr className="border-b border-[#E2E8F0]">
                                                <th className="px-2 py-2 text-sm font-bold text-[#334155]">المادة</th>
                                                <th className="px-2 py-2 text-center text-sm font-bold text-[#334155]">مرحلة</th>
                                                <th className="px-2 py-2 text-center text-sm font-bold text-[#334155]">الوقت</th>
                                                <th className="px-2 py-2 text-center text-sm font-bold text-[#334155]">المدة</th>
                                                <th className="px-2 py-2 text-sm font-bold text-[#334155]">القاعة</th>
                                                <th className="px-2 py-2 text-center text-sm font-bold text-[#334155]">مقاعد</th>
                                                <th className="px-2 py-2 text-center text-sm font-bold text-[#334155]">حضور</th>
                                                <th className="px-2 py-2 text-center text-sm font-bold text-[#334155]">غياب</th>
                                                <th className="px-2 py-2 text-sm font-bold text-[#334155]">أسماء الغائبين</th>
                                                <th className="px-2 py-2 text-center text-sm font-bold text-[#334155]">نوع</th>
                                                <th className="px-2 py-2 text-center text-sm font-bold text-[#334155]">حالة</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#E2E8F0]">
                                              {dep.sessions.map((s, idx) => (
                                                <tr key={`${depKey}-${idx}`} className="hover:bg-[#F8FAFC]">
                                                  <td className="max-w-0 px-2 py-2 break-words text-[12px] font-semibold text-[#0F172A]">
                                                    {s.study_subject_name}
                                                    {s.room_names.length > 1 ? (
                                                      <span className="mt-0.5 block text-[10px] font-normal text-[#64748B]">
                                                        جلسة متعددة القاعات ({s.room_names.length})
                                                      </span>
                                                    ) : null}
                                                  </td>
                                                  <td className="px-2 py-2 text-center text-[12px] tabular-nums text-[#334155]">{s.stage_level}</td>
                                                  <td className="px-2 py-2 text-center text-[12px] tabular-nums text-[#334155]">
                                                    {timeRangeLabel(s.start_time, s.end_time)}
                                                  </td>
                                                  <td className="px-2 py-2 text-center text-[12px] text-[#334155]">{formatDuration(s.duration_minutes)}</td>
                                                  <td className="max-w-0 px-2 py-2 break-words text-[12px] text-[#334155]">
                                                    {s.room_names.length > 1 ? (
                                                      <ul className="list-disc space-y-0.5 pe-3 text-[11px] leading-snug">
                                                        {s.room_names.map((rn, i) => (
                                                          <li key={i}>{rn}</li>
                                                        ))}
                                                      </ul>
                                                    ) : (
                                                      s.room_names[0] ?? "—"
                                                    )}
                                                  </td>
                                                  <td className="px-2 py-2 text-center text-[12px] tabular-nums font-medium text-[#0F172A]">
                                                    {s.capacity_total}
                                                  </td>
                                                  <td className="px-2 py-2 text-center text-[12px] tabular-nums text-emerald-800">{s.attendance_count}</td>
                                                  <td className="px-2 py-2 text-center text-[12px] tabular-nums text-amber-900">{s.absence_count}</td>
                                                  <td className="max-w-[220px] px-2 py-2 break-words text-[11px] leading-relaxed text-[#475569]">
                                                    {s.absence_names ?? "—"}
                                                  </td>
                                                  <td className="px-2 py-2 text-center text-[11px] text-[#475569]">
                                                    {SCHEDULE_TYPE_SHORT[s.schedule_type]}
                                                    <div className="mt-0.5 text-[10px] text-[#94A3B8]">
                                                      {[s.academic_year, s.term_label].filter(Boolean).join(" · ") || "—"}
                                                    </div>
                                                  </td>
                                                  <td className="px-2 py-2 text-center">
                                                    <span
                                                      className={`inline-flex rounded-lg px-2 py-0.5 text-[11px] font-bold ring-1 ${workflowBadgeClass(s.workflow_status)}`}
                                                    >
                                                      {WORKFLOW_LABEL[s.workflow_status]}
                                                    </span>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                        <TotalsStrip
                                          label={`ملخص القسم: ${dep.deptName}`}
                                          capacity={dep.totals.capacity}
                                          present={dep.totals.present}
                                          absent={dep.totals.absent}
                                        />
                                      </>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
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
