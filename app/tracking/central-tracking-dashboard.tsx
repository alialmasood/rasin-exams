"use client";

import { logoutAction } from "@/app/dashboard/actions";
import { refreshCentralTrackingAction } from "@/app/tracking/actions";
import { participationExportNowLabel } from "@/lib/admin-exam-participation-export";
import {
  buildCentralTrackingReportPrintHtml,
  printCentralTrackingReportHtml,
} from "@/lib/central-tracking-report-html";
import { printCentralTrackingSingleSituation } from "@/lib/central-tracking-situation-print";
import { describeCapacityByShiftAr } from "@/lib/capacity-by-shift-ar";
import type { CentralTrackingExamRow } from "@/lib/college-exam-situations";
import type { DeanSituationStatus } from "@/lib/upload-status-display";
import {
  calendarDateInTimeZone,
  EXAM_SITUATION_TZ,
  minutesSinceMidnightInTimeZone,
  parseTimeToMinutes,
} from "@/lib/exam-situation-window";
import type { SessionPayload } from "@/lib/session";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/** دلالات ألوان غرفة القيادة: طبيعي | جيد | تنبيه | خطر */
type SemanticTone = "normal" | "good" | "warning" | "danger";

function countUniqueColleges(r: CentralTrackingExamRow[]): number {
  return new Set(r.map((x) => x.collegeName)).size;
}

type ExamTypeFilter = "ALL" | "FINAL" | "SEMESTER";
type StudyLevelFilter = "ALL" | "UNDERGRAD" | "POSTGRAD";

function nowBaghdadLabel(d: Date): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory", {
      timeZone: EXAM_SITUATION_TZ,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString("ar-IQ");
  }
}

function examEnded(row: CentralTrackingExamRow, now: Date): boolean {
  const today = calendarDateInTimeZone(now, EXAM_SITUATION_TZ);
  if (row.examDate < today) return true;
  if (row.examDate > today) return false;
  const endM = parseTimeToMinutes(row.endTime);
  if (endM < 0) return false;
  return minutesSinceMidnightInTimeZone(now, EXAM_SITUATION_TZ) > endM;
}

function highAbsence(row: CentralTrackingExamRow): boolean {
  const c = row.studentsCount;
  if (c <= 0) return false;
  return row.absencesCount / c >= 0.15;
}

/** تمييز صف الجدول: عدم رفع الموقف أولاً، ثم غياب مرتفع */
function trackingRowVisual(r: CentralTrackingExamRow): "notSubmitted" | "highAbsence" | "normal" {
  if (r.reportStatus === "NOT_SUBMITTED") return "notSubmitted";
  if (highAbsence(r)) return "highAbsence";
  return "normal";
}

function trackingRowClass(v: ReturnType<typeof trackingRowVisual>): string {
  const base =
    "border-b border-stone-200/90 transition-colors duration-150 hover:bg-stone-50/90";
  switch (v) {
    case "notSubmitted":
      return `${base} border-s-[3px] border-s-rose-600 bg-rose-50/50`;
    case "highAbsence":
      return `${base} border-s-[3px] border-s-amber-500 bg-amber-50/40`;
    default:
      return `${base} border-s-[3px] border-s-teal-600/35 bg-teal-50/25`;
  }
}

function operationalAlertCount(r: CentralTrackingExamRow[], now: Date): number {
  let n = 0;
  const seen = new Set<string>();
  for (const row of r) {
    if (highAbsence(row)) {
      const id = `abs-${row.scheduleId}`;
      if (!seen.has(id)) {
        seen.add(id);
        n++;
      }
    }
    if (row.reportStatus === "NOT_SUBMITTED" && examEnded(row, now)) {
      const id = `late-${row.scheduleId}`;
      if (!seen.has(id)) {
        seen.add(id);
        n++;
      }
    }
  }
  return n;
}

function examSituationLevel(
  r: CentralTrackingExamRow[],
  now: Date
): { tone: SemanticTone; labelAr: string } {
  const anyLateCritical = r.some((x) => x.reportStatus === "NOT_SUBMITTED" && examEnded(x, now));
  if (anyLateCritical) {
    return { tone: "danger", labelAr: "تحتاج تدخل" };
  }
  const anyMissing = r.some((x) => x.reportStatus === "NOT_SUBMITTED");
  const anyPending = r.some((x) => x.reportStatus === "PENDING");
  const alerts = operationalAlertCount(r, now);
  if (anyMissing || anyPending || alerts > 0) {
    return { tone: "warning", labelAr: "مراقبة" };
  }
  if (r.length === 0) {
    return { tone: "normal", labelAr: "لا جلسات لهذا اليوم" };
  }
  return { tone: "good", labelAr: "مستقرة" };
}

function absenceSemantic(absences: number, students: number): SemanticTone {
  if (students <= 0) return absences > 0 ? "warning" : "normal";
  if (absences <= 0) return "good";
  const ratio = absences / students;
  if (ratio >= 0.15) return "danger";
  if (ratio >= 0.06) return "warning";
  return "normal";
}

/** شريط سفلي للهيدر — ألوان جامعية (ذهبي للاستقرار، عنبر للمراقبة، وردي للخطورة) */
function commandHeaderAccentBorder(tone: SemanticTone): string {
  switch (tone) {
    case "good":
      return "border-amber-500";
    case "warning":
      return "border-amber-600";
    case "danger":
      return "border-rose-600";
    default:
      return "border-sky-500/80";
  }
}

function systemStabilityHeadline(tone: SemanticTone, fallbackLabel: string): { title: string } {
  switch (tone) {
    case "good":
      return { title: "النظام مستقر" };
    case "warning":
      return { title: "النظام تحت المراقبة" };
    case "danger":
      return { title: "تدخل فوري مطلوب" };
    default:
      return { title: fallbackLabel };
  }
}

function formatLastRefreshLabel(seconds: number, loading: boolean): string {
  if (loading) return "جاري التحديث…";
  if (seconds < 2) return "الآن";
  if (seconds < 60) {
    if (seconds >= 2 && seconds <= 10) return `قبل ${seconds} ثوانٍ`;
    return `قبل ${seconds} ثانية`;
  }
  const m = Math.floor(seconds / 60);
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  return `قبل ${h} ساعة`;
}

/** شارات حالة رسمية — نقطة لونية + نص */
function trackingStatusMonitorBadge(r: CentralTrackingExamRow, now: Date) {
  const late = r.reportStatus === "NOT_SUBMITTED" && examEnded(r, now);

  if (r.reportStatus === "SUBMITTED") {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap rounded border border-teal-600/25 bg-teal-50/80 px-2.5 py-1 text-[11px] font-semibold text-teal-900 sm:text-xs">
        <span className="size-1.5 shrink-0 rounded-full bg-teal-600" aria-hidden />
        تم الرفع
      </span>
    );
  }

  if (late) {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap rounded border border-rose-500/35 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-900 sm:text-xs">
        <span className="size-1.5 shrink-0 rounded-full bg-rose-600" aria-hidden />
        متأخر
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded border border-amber-500/30 bg-amber-50/90 px-2.5 py-1 text-[11px] font-semibold text-amber-950 sm:text-xs">
      <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
      قيد الانتظار
    </span>
  );
}

function examTypeLabel(t: CentralTrackingExamRow["examType"]) {
  return t === "SEMESTER" ? "فصلي" : "نهائي";
}

function stageOrdinalAr(level: number): string {
  if (level === 11) return "دبلوم";
  if (level === 12) return "ماجستير";
  if (level === 13) return "دكتوراه";
  const map: Record<number, string> = {
    1: "الأولى",
    2: "الثانية",
    3: "الثالثة",
    4: "الرابعة",
    5: "الخامسة",
    6: "السادسة",
  };
  return map[level] ?? `المرحلة ${level}`;
}

/** أولية حتى المراحل 1–10؛ 11–13 = برامج عليا (دبلوم/ماجستير/دكتوراه) */
function stageBandAr(level: number): string {
  if (level >= 11) return "دراسات عليا";
  if (level >= 1 && level <= 10) return "المرحلة الأولية";
  return "—";
}

/** الفصل الدراسي من الجدول المعتمد (قيم النموذج: الأول / الثاني) */
function academicTermReportAr(term: string | null | undefined): string {
  const t = String(term ?? "").trim();
  if (!t) return "— (غير مُدخل في الجدول الامتحاني)";
  if (t === "الأول") return "الفصل الدراسي الأول";
  if (t === "الثاني") return "الفصل الدراسي الثاني";
  return t;
}

function examDateWeekdayAr(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory", {
      weekday: "long",
      timeZone: EXAM_SITUATION_TZ,
    }).format(new Date(`${isoDate}T12:00:00`));
  } catch {
    return "—";
  }
}

function examDateLongAr(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory", {
      timeZone: EXAM_SITUATION_TZ,
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(`${isoDate}T12:00:00`));
  } catch {
    return isoDate;
  }
}

/** تحليل أسطر «اسم — سبب» أو «اسم: سبب» لعرض جدولي */
function parseNameReasonLines(raw: string | null | undefined): { name: string; reason: string }[] {
  const t = String(raw ?? "").trim();
  if (!t || t === "—") return [];
  const out: { name: string; reason: string }[] = [];
  for (const line of t.split(/\r?\n/)) {
    const L = line.trim();
    if (!L || L.startsWith("---")) continue;
    const colon = L.indexOf(":");
    const dash = L.indexOf("—");
    if (colon !== -1) {
      out.push({
        name: L.slice(0, colon).trim() || "—",
        reason: L.slice(colon + 1).trim() || "—",
      });
    } else if (dash !== -1) {
      out.push({
        name: L.slice(0, dash).trim() || "—",
        reason: L.slice(dash + 1).trim() || "—",
      });
    } else {
      out.push({ name: L, reason: "—" });
    }
  }
  return out;
}

function deanStatusAr(s: DeanSituationStatus): string {
  if (s === "APPROVED") return "معتمد";
  if (s === "PENDING") return "قيد المراجعة";
  if (s === "REJECTED") return "مرفوض";
  return "—";
}

function sortRowsByPriority(rows: CentralTrackingExamRow[], now: Date): CentralTrackingExamRow[] {
  const score = (r: CentralTrackingExamRow) => {
    let s = 0;
    if (r.reportStatus === "NOT_SUBMITTED") s += 400;
    else if (r.reportStatus === "PENDING") s += 200;
    if (r.reportStatus === "NOT_SUBMITTED" && examEnded(r, now)) s += 150;
    if (highAbsence(r)) s += 80;
    return -s;
  };
  return [...rows].sort((a, b) => score(a) - score(b) || a.collegeName.localeCompare(b.collegeName, "ar"));
}

function groupCollegePanels(rows: CentralTrackingExamRow[]) {
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!map.has(r.collegeName)) map.set(r.collegeName, new Set());
    map.get(r.collegeName)!.add(r.reportStatus);
  }
  const notSubmitted: string[] = [];
  const pending: string[] = [];
  const submitted: string[] = [];
  for (const [name, set] of map) {
    if (set.has("NOT_SUBMITTED")) notSubmitted.push(name);
    else if (set.has("PENDING")) pending.push(name);
    else submitted.push(name);
  }
  notSubmitted.sort((a, b) => a.localeCompare(b, "ar"));
  pending.sort((a, b) => a.localeCompare(b, "ar"));
  submitted.sort((a, b) => a.localeCompare(b, "ar"));
  return { notSubmitted, pending, submitted };
}

/** قائمة إجراءات مدمجة (توفير عرض الجدول) — منفذة إلى `document` لتفادي القص داخل منطقة scroll */
function SessionRowActionsMenu({
  row,
  isOpen,
  onOpenChange,
  onDetails,
}: {
  row: CentralTrackingExamRow;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDetails: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPos(null);
      return;
    }
    function place() {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      onOpenChange(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [isOpen, onOpenChange]);

  const menu =
    isOpen && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: menuPos.top,
              right: menuPos.right,
              zIndex: 9999,
            }}
            className="min-w-[11.5rem] rounded-lg border border-stone-200 bg-white py-1 shadow-lg shadow-stone-300/60"
          >
            <button
              role="menuitem"
              type="button"
              className="w-full px-3 py-2 text-start text-sm font-semibold text-stone-800 transition hover:bg-sky-50"
              onClick={() => {
                onDetails();
                onOpenChange(false);
              }}
            >
              تفاصيل
            </button>
            <button
              role="menuitem"
              type="button"
              className="w-full px-3 py-2 text-start text-sm font-semibold text-stone-800 transition hover:bg-sky-50"
              onClick={() => {
                if (!printCentralTrackingSingleSituation(row)) {
                  window.alert(
                    "تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة، ثم اختر «حفظ كـ PDF» عند الحاجة."
                  );
                }
                onOpenChange(false);
              }}
            >
              طباعة الموقف
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="flex justify-center">
      <button
        ref={btnRef}
        type="button"
        className="flex size-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 shadow-sm transition hover:bg-stone-50 hover:text-[#1a3052] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-1"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`إجراءات الجلسة — ${row.subject}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!isOpen);
        }}
      >
        <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      </button>
      {menu}
    </div>
  );
}

export function CentralTrackingDashboard({
  initialDate,
  initialRows,
  session,
  accountDisplayName,
}: {
  initialDate: string;
  initialRows: CentralTrackingExamRow[];
  session: SessionPayload;
  /** اسم الحساب كما في إدارة الحسابات (حامل الحساب — رئاسة / مساعد علمي، إلخ) */
  accountDisplayName?: string;
}) {
  const [examDate, setExamDate] = useState(initialDate);
  const [rows, setRows] = useState<CentralTrackingExamRow[]>(initialRows);
  const [loading, setLoading] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [detail, setDetail] = useState<CentralTrackingExamRow | null>(null);
  const [actionMenuScheduleId, setActionMenuScheduleId] = useState<string | null>(null);
  const [collegeFilter, setCollegeFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [examTypeFilter, setExamTypeFilter] = useState<ExamTypeFilter>("ALL");
  const [studyLevelFilter, setStudyLevelFilter] = useState<StudyLevelFilter>("ALL");
  const [lastRefreshAt, setLastRefreshAt] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const loadDate = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await refreshCentralTrackingAction(d);
      if (res.ok) {
        setRows(res.rows);
        setLastRefreshAt(Date.now());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const secondsSinceRefresh = useMemo(
    () => Math.max(0, Math.floor((clock.getTime() - lastRefreshAt) / 1000)),
    [clock, lastRefreshAt]
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadDate(examDate);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [examDate, loadDate]);

  const colleges = useMemo(() => {
    const u = new Set<string>();
    for (const r of rows) u.add(r.collegeName);
    return [...u].sort((a, b) => a.localeCompare(b, "ar"));
  }, [rows]);

  const departments = useMemo(() => {
    const u = new Set<string>();
    for (const r of rows) {
      if (!collegeFilter || r.collegeName === collegeFilter) u.add(r.department);
    }
    return [...u].sort((a, b) => a.localeCompare(b, "ar"));
  }, [rows, collegeFilter]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (collegeFilter && r.collegeName !== collegeFilter) return false;
      if (deptFilter && r.department !== deptFilter) return false;
      if (examTypeFilter !== "ALL" && r.examType !== examTypeFilter) return false;
      if (studyLevelFilter === "UNDERGRAD" && r.stageLevel >= 11) return false;
      if (studyLevelFilter === "POSTGRAD" && r.stageLevel < 11) return false;
      return true;
    });
  }, [rows, collegeFilter, deptFilter, examTypeFilter, studyLevelFilter]);

  const sorted = useMemo(() => sortRowsByPriority(filtered, clock), [filtered, clock]);

  const kpis = useMemo(() => {
    const collegeSet = new Set(filtered.map((r) => r.collegeName));
    let students = 0;
    let abs = 0;
    let sub = 0;
    let lateMissing = 0;
    for (const r of filtered) {
      students += r.studentsCount;
      abs += r.absencesCount;
      if (r.reportStatus === "SUBMITTED") sub++;
      if (r.reportStatus === "NOT_SUBMITTED") lateMissing++;
    }
    return {
      colleges: collegeSet.size,
      exams: filtered.length,
      students,
      absences: abs,
      submitted: sub,
      lateMissing,
    };
  }, [filtered]);

  const commandLevel = useMemo(() => examSituationLevel(rows, clock), [rows, clock]);
  const commandColleges = useMemo(() => countUniqueColleges(rows), [rows]);
  const commandAlertCount = useMemo(() => operationalAlertCount(rows, clock), [rows, clock]);

  const panels = useMemo(() => groupCollegePanels(rows), [rows]);

  /** تنبيهات بصيغة «غرفة القيادة» — عنوان + تفاصيل */
  const systemAlerts = useMemo(() => {
    const out: {
      id: string;
      kind: "danger" | "warning" | "info";
      headline: string;
      line: string;
    }[] = [];
    for (const r of filtered) {
      if (r.reportStatus === "NOT_SUBMITTED") {
        const late = examEnded(r, clock);
        out.push({
          id: `ns-${r.scheduleId}`,
          kind: late ? "danger" : "warning",
          headline: late ? "تنبيه عاجل — متأخر عن الرفع" : "تنبيه مهم",
          line: late
            ? `كلية ${r.collegeName} لم تُرفع الموقف بعد انتهاء الجلسة — ${r.subject}`
            : `كلية ${r.collegeName} لم تُرفع الموقف بعد — ${r.subject}`,
        });
      }
      if (highAbsence(r)) {
        out.push({
          id: `abs-${r.scheduleId}`,
          kind: "warning",
          headline: "تنبيه — غياب عالٍ",
          line: `كلية ${r.collegeName} — ${r.subject} · الغياب ${r.absencesCount} من ${r.studentsCount}`,
        });
      }
    }
    out.push({
      id: "observers-system",
      kind: "info",
      headline: "ملاحظة نظام",
      line: "نقص بيانات المراقبين في النظام — تُعرض كصفر إلى حين اكتمال التسجيل لكل كلية",
    });
    return out;
  }, [filtered, clock]);

  const operationalOnly = useMemo(
    () => systemAlerts.filter((a) => a.id !== "observers-system"),
    [systemAlerts]
  );

  const stability = useMemo(
    () => systemStabilityHeadline(commandLevel.tone, commandLevel.labelAr),
    [commandLevel.tone, commandLevel.labelAr]
  );

  const onPrintOfficialPdf = useCallback(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const filterParts: string[] = [];
    if (collegeFilter) filterParts.push(`الكلية: ${collegeFilter}`);
    if (deptFilter) filterParts.push(`القسم: ${deptFilter}`);
    if (examTypeFilter === "FINAL") filterParts.push("نوع الامتحان: نهائي");
    if (examTypeFilter === "SEMESTER") filterParts.push("نوع الامتحان: فصلي");
    if (studyLevelFilter === "UNDERGRAD") filterParts.push("المستوى: الدراسة الأولية (ما دون برامج الدبلوم/الماجستير/الدكتوراه)");
    if (studyLevelFilter === "POSTGRAD") filterParts.push("المستوى: الدراسات العليا (دبلوم / ماجستير / دكتوراه)");
    const filterScopeAr =
      filterParts.length > 0 ? filterParts.join(" — ") : "جميع الكليات والأقسام — دون تقييد إضافي على نوع الامتحان أو المرحلة";
    const issuedByLineAr = [accountDisplayName?.trim(), session.username].filter(Boolean).join(" — ");
    const html = buildCentralTrackingReportPrintHtml(
      {
        examDateIso: examDate,
        filterScopeAr,
        rows: sorted,
        generatedLabelAr: participationExportNowLabel(),
        issuedByLineAr: issuedByLineAr || undefined,
        operationalSummaryAr: `${stability.title} (${commandLevel.labelAr})`,
        kpis,
        assetsBaseUrl: origin,
      },
      new Date()
    );
    if (!printCentralTrackingReportHtml(html)) {
      window.alert(
        "تعذر فتح نافذة التقرير. اسمح بالنوافذ المنبثقة لهذا الموقع، ثم اختر «حفظ كـ PDF» من نافذة الطباعة."
      );
    }
  }, [
    accountDisplayName,
    collegeFilter,
    commandLevel.labelAr,
    deptFilter,
    examDate,
    examTypeFilter,
    kpis,
    session.username,
    sorted,
    stability.title,
    studyLevelFilter,
  ]);

  return (
    <div className="min-h-dvh bg-[#f6f4ef] text-stone-900 antialiased">
      <header
        className={`sticky top-0 z-40 border-b-2 ${commandHeaderAccentBorder(commandLevel.tone)} bg-gradient-to-bl from-[#1a3052] via-[#1e3d5c] to-[#152a42] text-stone-100 shadow-sm`}
        role="banner"
      >
        <div className="relative mx-auto max-w-[1800px] px-3 pb-2.5 pt-2.5 sm:px-5 sm:pb-3 sm:pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-2.5 sm:pb-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-bold tracking-tight text-white sm:text-lg">
                المتابعة المركزية للامتحانات
              </h1>
              <p className="mt-0.5 truncate text-[11px] text-sky-100/85 sm:text-xs">
                <span className="font-medium text-amber-50/90">
                  {accountDisplayName ?? "المتابعة المركزية"}
                </span>
                <span className="mx-1.5 text-white/35">|</span>
                <span className="font-mono tabular-nums text-white/55">{session.username}</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div
                className="rounded border border-white/15 bg-white/[0.07] px-2.5 py-1 text-[10px] font-medium tabular-nums leading-snug text-sky-50 sm:px-3 sm:text-[11px]"
                suppressHydrationWarning
              >
                {nowBaghdadLabel(clock)}
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded border border-amber-400/35 bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-50 transition hover:bg-amber-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a3052] sm:px-3 sm:text-xs"
                >
                  خروج
                </button>
              </form>
            </div>
          </div>

          <div
            className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-2 xl:grid-cols-4 xl:gap-2"
            role="status"
            aria-live="polite"
          >
            <CommandControlTile
              main={stability.title}
              sub="مؤشر الحالة العامة للمنظومة"
              accent={commandLevel.tone}
            />
            <CommandControlTile
              main={`${commandColleges} كلية`}
              sub="ضمن نطاق تاريخ العرض الحالي"
              accent="neutral"
            />
            <CommandControlTile
              main={`${commandAlertCount} ${commandAlertCount === 1 ? "تنبيه تشغيلي" : "تنبيهات تشغيلية"}`}
              sub="تأخر رفع الموقف أو غياب مرتفع"
              accent={commandAlertCount > 0 ? "warning" : "neutral"}
            />
            <CommandControlTile
              main={formatLastRefreshLabel(secondsSinceRefresh, loading)}
              sub="آخر تحديث للبيانات — تلقائي كل ٣٠ ثانية"
              accent="time"
              pulse={loading}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1800px] px-3 py-4 sm:px-5 sm:py-5">
        <section
          className="mb-5 rounded-md border border-stone-200/90 bg-white shadow-sm shadow-stone-200/40"
          aria-label="عوامل التصفية"
        >
          <div className="border-b border-sky-100/80 bg-gradient-to-l from-sky-50/90 to-stone-50/50 px-3 py-2 sm:px-4 sm:py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-[#1a3052] sm:text-sm">معايير العرض والتصفية</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onPrintOfficialPdf}
                  className="rounded-lg border border-[#1a3052] bg-white px-2.5 py-1 text-[10px] font-bold text-[#1a3052] shadow-sm transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 sm:px-3 sm:text-xs"
                  title="تقرير رسمي باسم الجامعة — طباعة أو حفظ PDF من نافذة المتصفح"
                >
                  طباعة / PDF رسمي
                </button>
                {loading ? (
                  <span className="text-[10px] font-medium text-stone-500 sm:text-xs">جاري تحديث البيانات…</span>
                ) : (
                  <span className="text-[10px] text-stone-500 sm:text-xs">تحديث تلقائي كل ٣٠ ثانية</span>
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 sm:gap-4 sm:p-4">
            <label className="grid gap-1.5 text-[11px] font-semibold text-stone-600 sm:text-xs">
              الكلية
              <select
                className="rounded border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/50 focus:ring-offset-1"
                value={collegeFilter}
                onChange={(e) => {
                  setCollegeFilter(e.target.value);
                  setDeptFilter("");
                }}
              >
                <option value="">الكل</option>
                {colleges.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-stone-600 sm:text-xs">
              القسم
              <select
                className="rounded border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/50 focus:ring-offset-1"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="">الكل</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-stone-600 sm:text-xs">
              تاريخ الامتحان
              <input
                type="date"
                className="rounded border border-stone-200 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/50 focus:ring-offset-1"
                value={examDate}
                onChange={async (e) => {
                  const v = e.target.value;
                  setExamDate(v);
                  await loadDate(v);
                }}
              />
            </label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-stone-600 sm:text-xs">
              نوع الامتحان
              <select
                className="rounded border border-stone-200 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/50 focus:ring-offset-1"
                value={examTypeFilter}
                onChange={(e) => setExamTypeFilter(e.target.value as ExamTypeFilter)}
              >
                <option value="ALL">الكل</option>
                <option value="FINAL">نهائي</option>
                <option value="SEMESTER">فصلي</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-stone-600 sm:text-xs">
              المرحلة الدراسية
              <select
                className="rounded border border-stone-200 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/50 focus:ring-offset-1"
                value={studyLevelFilter}
                onChange={(e) => setStudyLevelFilter(e.target.value as StudyLevelFilter)}
              >
                <option value="ALL">الكل</option>
                <option value="UNDERGRAD">الدراسة الأولية</option>
                <option value="POSTGRAD">الدراسات العليا (دبلوم / ماجستير / دكتوراه)</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void loadDate(examDate)}
                className="w-full rounded border border-[#1a3052] bg-[#1e4976] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1a3052] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 sm:py-2"
              >
                تحديث البيانات
              </button>
            </div>
          </div>
        </section>

        <section className="mb-5" aria-label="مؤشرات التصفية الحالية">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-stone-500 sm:text-xs">
            ملخص المؤشرات وفق معايير التصفية
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <CommandKpiCard
              value={kpis.colleges}
              label="الكليات"
              semantic="normal"
              icon={<IconColleges />}
            />
            <CommandKpiCard
              value={kpis.exams}
              label="الجلسات"
              semantic="normal"
              icon={<IconSessions />}
            />
            <CommandKpiCard
              value={kpis.students}
              label="الطلبة"
              semantic="normal"
              icon={<IconStudents />}
            />
            <CommandKpiCard
              value={kpis.absences}
              label="الغياب"
              semantic={absenceSemantic(kpis.absences, kpis.students)}
              icon={<IconAbsence />}
            />
            <CommandKpiCard
              value={kpis.submitted}
              label="التقارير"
              semantic="good"
              icon={<IconReports />}
            />
            <CommandKpiCard
              value={kpis.lateMissing}
              label="المتأخر"
              semantic={kpis.lateMissing > 0 ? "danger" : "good"}
              icon={<IconLate />}
            />
          </div>
        </section>

        {/*
          RTL + flex-row: أول عنصر يميناً = التنبيهات، ثانٍ يساراً = الجدول (الأوسع)
          على الشاشات الصغيرة: الجدول أعلى (عبر flex-col-reverse)
        */}
        <div className="flex flex-col-reverse gap-5 xl:flex-row xl:items-stretch">
          <aside
            className="flex w-full shrink-0 flex-col gap-3 xl:w-[23rem]"
            aria-label="تنبيهات النظام وحالة الكليات"
          >
            <section
              className="rounded-md border border-stone-200 bg-white shadow-sm shadow-stone-200/30"
              aria-labelledby="system-alerts-heading"
            >
              <h2
                id="system-alerts-heading"
                className="border-b border-sky-100 bg-gradient-to-l from-sky-50/80 to-stone-50/40 px-3 py-2 text-xs font-bold text-[#1a3052] sm:px-4 sm:text-sm"
              >
                سجل التنبيهات والملاحظات
              </h2>
              <ul className="max-h-[min(52vh,28rem)] space-y-0 divide-y divide-stone-100 overflow-y-auto">
                {operationalOnly.length === 0 ? (
                  <li className="flex gap-3 bg-teal-50/30 px-3 py-3 text-sm text-stone-700 sm:px-4">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-teal-600" aria-hidden />
                    <p className="font-medium leading-relaxed">لا توجد تنبيهات عاجلة ضمن معايير العرض الحالية.</p>
                  </li>
                ) : (
                  operationalOnly.map((a) => (
                    <li
                      key={a.id}
                      className={
                        a.kind === "danger"
                          ? "flex gap-0 bg-rose-50/40"
                          : a.kind === "warning"
                            ? "flex gap-0 bg-amber-50/35"
                            : "flex gap-0 bg-stone-50/50"
                      }
                    >
                      <span
                        className={
                          a.kind === "danger"
                            ? "w-1 shrink-0 bg-rose-600"
                            : a.kind === "warning"
                              ? "w-1 shrink-0 bg-amber-500"
                              : "w-1 shrink-0 bg-sky-600"
                        }
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 space-y-1 px-3 py-3 sm:px-4">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500 sm:text-xs">
                          {a.headline}
                        </p>
                        <p className="text-sm font-medium leading-relaxed text-stone-800">{a.line}</p>
                      </div>
                    </li>
                  ))
                )}
                {systemAlerts
                  .filter((a) => a.id === "observers-system")
                  .map((a) => (
                    <li key={a.id} className="flex gap-0 bg-sky-50/40">
                      <span className="w-1 shrink-0 bg-sky-700" aria-hidden />
                      <div className="min-w-0 flex-1 space-y-1 px-3 py-3 sm:px-4">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500 sm:text-xs">
                          {a.headline}
                        </p>
                        <p className="text-sm font-medium leading-relaxed text-stone-700">{a.line}</p>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>

            <div className="rounded-md border border-stone-200 bg-white shadow-sm shadow-stone-200/30">
              <p className="rounded-t-md border-b border-teal-100 bg-teal-50/50 px-3 py-2 text-[11px] font-bold text-teal-950 sm:text-xs">
                كليات اكتمل اعتماد مواقفها
              </p>
              <ul className="max-h-36 space-y-0.5 overflow-y-auto px-3 py-2.5 text-sm text-stone-700 sm:px-4">
                {panels.submitted.length === 0 ? (
                  <li className="text-stone-400">لا يوجد</li>
                ) : (
                  panels.submitted.map((n) => (
                    <li key={n} className="border-s-2 border-s-teal-600/35 ps-2">
                      {n}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="rounded-md border border-stone-200 bg-white shadow-sm shadow-stone-200/30">
              <p className="rounded-t-md border-b border-amber-100 bg-amber-50/50 px-3 py-2 text-[11px] font-bold text-amber-950 sm:text-xs">
                كليات بانتظار الإجراء
              </p>
              <ul className="max-h-36 space-y-0.5 overflow-y-auto px-3 py-2.5 text-sm text-stone-700 sm:px-4">
                {panels.pending.length === 0 ? (
                  <li className="text-stone-400">لا يوجد</li>
                ) : (
                  panels.pending.map((n) => (
                    <li key={n} className="border-s-2 border-s-amber-500/45 ps-2">
                      {n}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="rounded-md border border-stone-200 bg-white shadow-sm shadow-stone-200/30">
              <p className="rounded-t-md border-b border-rose-100 bg-rose-50/40 px-3 py-2 text-[11px] font-bold text-rose-950 sm:text-xs">
                كليات بمواقف غير مُرسلة
              </p>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto px-3 py-2.5 text-sm text-stone-700 sm:px-4">
                {panels.notSubmitted.length === 0 ? (
                  <li className="text-stone-400">لا يوجد</li>
                ) : (
                  panels.notSubmitted.map((n) => (
                    <li key={n} className="border-s-2 border-s-rose-600/40 ps-2">
                      {n}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <section
              className="overflow-hidden rounded-md border border-stone-200 bg-white shadow-sm shadow-stone-200/30"
              aria-label="جدول الجلسات"
            >
              <div className="border-b border-sky-100 bg-gradient-to-l from-sky-50/70 to-stone-50/30 px-3 py-2 sm:px-4 sm:py-2.5">
                <h2 className="text-xs font-bold text-[#1a3052] sm:text-sm">جدول الجلسات الامتحانية</h2>
                <p className="mt-0.5 text-[10px] text-stone-600 sm:text-xs">
                  عرض معلوماتي — جداول معتمدة من الكليات، مرتبة حسب الأولوية التشغيلية
                </p>
                <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[10px] text-stone-600 sm:text-[11px]">
                  <li className="flex items-center gap-1.5 font-medium">
                    <span className="size-2 rounded-full bg-rose-600" aria-hidden />
                    موقف غير مُرفوع
                  </li>
                  <li className="flex items-center gap-1.5 font-medium">
                    <span className="size-2 rounded-full bg-amber-500" aria-hidden />
                    غياب عالٍ (≥١٥٪)
                  </li>
                  <li className="flex items-center gap-1.5 font-medium">
                    <span className="size-2 rounded-full bg-teal-500" aria-hidden />
                    ضمن المدى الطبيعي
                  </li>
                </ul>
              </div>
              <div className="max-h-[min(70vh,52rem)] overflow-auto bg-white">
                <table className="min-w-[1180px] w-full border-collapse text-sm lg:min-w-[1320px]">
                  <thead className="sticky top-0 z-20 shadow-[0_1px_0_0_rgb(231,229,228)]">
                    <tr className="border-b border-stone-200 bg-gradient-to-b from-sky-50/98 to-stone-100/98 text-[11px] font-bold text-[#1a3052] backdrop-blur-sm sm:text-xs">
                      <th className="px-3 py-2 text-start whitespace-nowrap sm:px-4 sm:py-2.5">الكلية</th>
                      <th className="px-3 py-2 text-start whitespace-nowrap sm:px-4 sm:py-2.5">القسم</th>
                      <th className="px-3 py-2 text-start sm:px-4 sm:py-2.5">المادة</th>
                      <th className="px-3 py-2 text-start whitespace-nowrap sm:px-4 sm:py-2.5">المرحلة</th>
                      <th className="px-3 py-2 text-center tabular-nums whitespace-nowrap sm:px-4 sm:py-2.5">
                        الطلبة
                      </th>
                      <th className="px-3 py-2 text-center tabular-nums whitespace-nowrap sm:px-4 sm:py-2.5">
                        الحضور
                      </th>
                      <th className="px-3 py-2 text-center tabular-nums whitespace-nowrap sm:px-4 sm:py-2.5">
                        الغياب
                      </th>
                      <th className="px-3 py-2 text-center tabular-nums whitespace-nowrap sm:px-4 sm:py-2.5">
                        القاعات
                      </th>
                      <th className="px-3 py-2 text-start whitespace-nowrap sm:px-4 sm:py-2.5">الحالة</th>
                      <th className="w-12 px-1 py-2 text-center sm:w-14 sm:px-2">
                        <span className="sr-only">إجراءات</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr className="border-b border-stone-200">
                        <td colSpan={10} className="p-0">
                          <div className="flex flex-col items-center justify-center bg-stone-50/60 px-6 py-12 text-center sm:py-14">
                            <span
                              className="mb-3 flex size-12 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400 shadow-sm"
                              aria-hidden
                            >
                              <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5"
                                />
                              </svg>
                            </span>
                            <p className="text-sm font-bold text-[#1a3052] sm:text-base">لا توجد جلسات ضمن نطاق العرض</p>
                            <p className="mt-2 max-w-md text-xs leading-relaxed text-stone-600 sm:text-sm">
                              عند اعتماد الجداول ورفع المواقف من الكليات ستظهر البيانات هنا.
                            </p>
                            {rows.length > 0 && filtered.length === 0 ? (
                              <p className="mt-4 max-w-md border border-amber-200/90 bg-amber-50/80 px-3 py-2 text-[11px] font-semibold text-amber-950 sm:px-4 sm:text-xs">
                                معايير التصفية الحالية تستبعد كل النتائج — أعد ضبط الحقول أو اختر «الكل».
                              </p>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      sorted.map((r) => {
                        const rowVis = trackingRowVisual(r);
                        return (
                          <tr key={r.scheduleId} className={trackingRowClass(rowVis)}>
                            <td className="px-3 py-2 font-semibold text-[#1a3052] sm:px-4 sm:py-2.5">{r.collegeName}</td>
                            <td className="px-3 py-2 text-stone-700 sm:px-4 sm:py-2.5">{r.department}</td>
                            <td className="px-3 py-2 font-medium text-stone-900 sm:px-4 sm:py-2.5">{r.subject}</td>
                            <td className="px-3 py-2 tabular-nums text-stone-700 sm:px-4 sm:py-2.5">{r.studyStageLabel}</td>
                            <td className="px-3 py-2 text-center tabular-nums text-stone-900 sm:px-4 sm:py-2.5">
                              {r.studentsCount}
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums font-semibold text-emerald-900 sm:px-4 sm:py-2.5">
                              {r.reportStatus === "NOT_SUBMITTED" ? "—" : r.attendanceCount}
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums font-semibold text-stone-900 sm:px-4 sm:py-2.5">
                              {r.absencesCount}
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums text-stone-700 sm:px-4 sm:py-2.5">
                              {r.roomsCount}
                            </td>
                            <td className="px-3 py-2 sm:px-4 sm:py-2.5">{trackingStatusMonitorBadge(r, clock)}</td>
                            <td className="px-1 py-2 sm:px-2">
                              <SessionRowActionsMenu
                                row={r}
                                isOpen={actionMenuScheduleId === r.scheduleId}
                                onOpenChange={(open) => setActionMenuScheduleId(open ? r.scheduleId : null)}
                                onDetails={() => setDetail(r)}
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* درج التفاصيل */}
      {detail ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tracking-detail-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-[#1a3052]/45"
            aria-label="إغلاق النافذة"
            onClick={() => setDetail(null)}
          />
          <div className="relative z-10 flex max-h-[min(94dvh,980px)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-2xl sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-gradient-to-l from-[#1a3052] to-[#1e4976] px-3 py-2 text-white sm:px-4 sm:py-2.5">
              <h2 id="tracking-detail-title" className="text-xs font-bold sm:text-sm">
                تقرير الموقف الامتحاني — متابعة مركزية
              </h2>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded border border-amber-400/30 px-2 py-0.5 text-[11px] font-semibold text-amber-50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a3052] sm:px-3 sm:py-1 sm:text-xs"
              >
                إغلاق
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-stone-100 bg-[#faf9f6] p-3 sm:p-4">
              <CentralSituationReport row={detail} referenceTime={clock} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-stone-200 bg-white p-3 shadow-sm">
      <h3 className="border-b border-stone-200 pb-2 text-[11px] font-bold text-[#1a3052] sm:text-xs">{title}</h3>
      <div className="mt-2 space-y-0">{children}</div>
    </section>
  );
}

/** تسمية وقيمة في سطر واحد (لتوفير المسافة) */
/** فاصل بصري بين جزءين في سطر الجهة والتوقيت */
function ReportVenueSep() {
  return <span className="mx-1.5 inline-block h-4 w-px shrink-0 self-center bg-stone-300 sm:mx-2 sm:h-5" aria-hidden />;
}

/** صف داخل «بيانات الجهة والتوقيت» — حدود وخلفية خفيفة لتفادي اندماج البيانات */
function ReportVenueRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1.5 rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 shadow-sm sm:gap-x-2 sm:px-3.5 sm:py-3">
      {children}
    </div>
  );
}

function ReportFieldInline({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 border-b border-stone-100 py-1.5 last:border-b-0 sm:gap-x-2">
      <span className="shrink-0 text-[10px] font-bold leading-snug text-[#1a3052] sm:text-[11px]">{label}</span>
      <span className="shrink-0 text-stone-400" aria-hidden>
        :
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-stone-800">{value}</span>
    </div>
  );
}

function ReportField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-0.5 border-b border-stone-100 py-2 last:border-b-0 sm:grid-cols-[minmax(0,10.5rem)_1fr] sm:items-baseline sm:gap-3 sm:py-1.5">
      <div className="text-[10px] font-bold text-[#1a3052] sm:text-[11px]">{label}</div>
      <div className="text-sm font-medium text-stone-800">{value}</div>
    </div>
  );
}

function AbsenceReasonTable({
  rows,
  emptyLabel,
}: {
  rows: { name: string; reason: string }[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-stone-500">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto rounded border border-stone-200 bg-white">
      <table className="w-full min-w-[240px] border-collapse text-[11px] sm:text-xs">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50 text-[#1a3052]">
            <th className="px-2 py-1.5 text-start font-bold">الاسم</th>
            <th className="px-2 py-1.5 text-start font-bold">السبب</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-stone-100 last:border-b-0">
              <td className="px-2 py-1.5 align-top font-medium text-stone-800">{r.name}</td>
              <td className="px-2 py-1.5 align-top text-stone-700">{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CentralSituationReport({ row: d, referenceTime }: { row: CentralTrackingExamRow; referenceTime: Date }) {
  const useShift = d.capacityMorning > 0 || d.capacityEvening > 0;
  const shift = describeCapacityByShiftAr(d.capacityMorning, d.capacityEvening, d.studentsCount, {
    morning: d.attendanceMorning,
    evening: d.attendanceEvening,
    total: d.attendanceCount,
  });
  const stageBand = stageBandAr(d.stageLevel);
  const stageOrd = stageOrdinalAr(d.stageLevel);
  const combinedStudentAbsences = parseNameReasonLines(d.absenceDetails);

  return (
    <div className="space-y-3 text-sm">
      <ReportSection title="بيانات الجهة والتوقيت">
        <div className="mt-2.5 space-y-3 sm:space-y-3.5">
          <ReportVenueRow>
            <span className="shrink-0 text-[10px] font-bold text-[#1a3052] sm:text-[11px]">الكلية</span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              :
            </span>
            <span className="min-w-0 font-medium text-stone-900">{d.collegeName}</span>
            <ReportVenueSep />
            <span className="shrink-0 text-[10px] font-bold text-[#1a3052] sm:text-[11px]">القسم</span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              :
            </span>
            <span className="min-w-0 font-medium text-stone-900">{d.department}</span>
            <ReportVenueSep />
            <span className="sr-only">اليوم والتاريخ:</span>
            <span className="min-w-0 flex-1 text-sm font-medium tabular-nums text-stone-900">
              {examDateWeekdayAr(d.examDate)} — {examDateLongAr(d.examDate)}
            </span>
          </ReportVenueRow>
          <ReportVenueRow>
            <span className="shrink-0 text-[10px] font-bold text-[#1a3052] sm:text-[11px]">الفصل أو الدور</span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              :
            </span>
            <span className="min-w-0 whitespace-nowrap font-medium text-stone-900">{academicTermReportAr(d.termLabel)}</span>
            <ReportVenueSep />
            <span className="shrink-0 text-[10px] font-bold text-[#1a3052] sm:text-[11px]">الامتحان</span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              :
            </span>
            <span className="min-w-0 flex-1 font-medium text-stone-900">{examTypeLabel(d.examType)}</span>
          </ReportVenueRow>
          <ReportVenueRow>
            <span className="shrink-0 text-[10px] font-bold text-[#1a3052] sm:text-[11px]">وقت الجلسة</span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              :
            </span>
            <span className="min-w-0 font-medium tabular-nums text-stone-900">
              {d.startTime} — {d.endTime}
            </span>
            <ReportVenueSep />
            <span className="shrink-0 text-[10px] font-bold text-[#1a3052] sm:text-[11px]">السنة الأكاديمية</span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              :
            </span>
            <span className="min-w-0 flex-1 font-medium text-stone-900">{d.academicYear ?? "—"}</span>
          </ReportVenueRow>
        </div>
      </ReportSection>

      <ReportSection title="المرحلة الدراسية">
        <ReportField label="التصنيف العام" value={stageBand} />
        <ReportField label="السنة / الدرجة" value={stageOrd} />
        {d.stageLevel >= 11 ? (
          <p className="mt-1 text-[10px] leading-relaxed text-stone-500 sm:text-[11px]">
            تفصيل نوع الدرجة العلمية (دكتوراه / ماجستير / دبلوم عالي) يعتمد على برنامج الكلية ولا يُخزَّن منفرداً في
            هذا السجل؛ المعتمد هنا رقم المرحلة الدراسية في الجدول المعتمد.
          </p>
        ) : null}
      </ReportSection>

      <ReportSection title="المادة والتدريس">
        <div className="mt-2.5 space-y-3 sm:space-y-3.5">
          <ReportVenueRow>
            <span className="shrink-0 text-[10px] font-bold text-[#1a3052] sm:text-[11px]">المادة الدراسية</span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              :
            </span>
            <span className="min-w-0 font-medium text-stone-900">{d.subject}</span>
            <ReportVenueSep />
            <span className="shrink-0 text-[10px] font-bold text-[#1a3052] sm:text-[11px]">اسم التدريسي / الملاحظات</span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              :
            </span>
            <span className="min-w-0 flex-1 font-medium text-stone-900">{d.instructor}</span>
          </ReportVenueRow>
          <ReportVenueRow>
            <span className="shrink-0 text-[10px] font-bold text-[#1a3052] sm:text-[11px]">نظام الدراسة</span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              :
            </span>
            <span className="min-w-0 font-medium text-stone-900">{d.studyTypeLabelAr}</span>
            <ReportVenueSep />
            <span className="shrink-0 text-[10px] font-bold text-[#1a3052] sm:text-[11px]">نوع الدراسة (الدوام)</span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              :
            </span>
            <span className="min-w-0 flex-1 font-medium text-stone-900">{shift.modeLabelAr}</span>
          </ReportVenueRow>
          {shift.detailRows.length > 0 ? (
            <ReportVenueRow>
              <ul className="w-full space-y-1.5 text-[11px] text-stone-600 sm:text-xs">
                {shift.detailRows.map((r) => (
                  <li
                    key={r.labelAr}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-stone-100 pb-1.5 last:border-b-0 last:pb-0"
                  >
                    <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                      <span className="font-medium text-stone-700">{r.labelAr}</span>
                      <span className="font-semibold tabular-nums text-stone-900">{r.value}</span>
                    </div>
                    {r.attendance !== undefined ? (
                      <div className="flex shrink-0 items-baseline gap-1.5">
                        <span className="text-[10px] font-bold text-[#1a3052] sm:text-[11px]">الحضور</span>
                        <span className="font-semibold tabular-nums text-stone-900">{r.attendance}</span>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </ReportVenueRow>
          ) : null}
        </div>
      </ReportSection>

      <ReportSection title="القاعات والطلبة">
        <div className="mt-2.5 space-y-3 sm:space-y-3.5">
          <ReportVenueRow>
            <span className="shrink-0 text-[10px] font-bold text-[#1a3052] sm:text-[11px]">القاعة (هذه الجلسة)</span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              :
            </span>
            <span className="min-w-0 font-medium text-stone-900">{d.roomName}</span>
            <ReportVenueSep />
            <span className="shrink-0 text-[10px] font-bold text-[#1a3052] sm:text-[11px]">
              عدد القاعات الامتحانية (لهذه الجلسة)
            </span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              :
            </span>
            <span className="min-w-0 flex-1 font-medium tabular-nums text-stone-900">{d.roomsCount}</span>
          </ReportVenueRow>
          <ReportVenueRow>
            <span className="shrink-0 text-[10px] font-bold text-[#1a3052] sm:text-[11px]">عدد الطلبة (السعة المعتمدة)</span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              :
            </span>
            <span className="min-w-0 font-medium tabular-nums text-stone-900">{d.studentsCount}</span>
            <ReportVenueSep />
            <span className="shrink-0 text-[10px] font-bold text-[#1a3052] sm:text-[11px]">عدد الغياب (الإجمالي)</span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              :
            </span>
            <span className="min-w-0 flex-1 font-medium tabular-nums text-stone-900">{d.absencesCount}</span>
          </ReportVenueRow>
        </div>
      </ReportSection>

      <ReportSection title="غياب الطلبة — الأسماء والأسباب">
        {useShift ? (
          <div className="space-y-3">
            {d.capacityMorning > 0 ? (
              <div>
                <p className="mb-1 text-[11px] font-bold text-stone-700">الدوام الصباحي — عدد الغياب: {d.absencesMorning}</p>
                <AbsenceReasonTable
                  rows={parseNameReasonLines(d.absenceNamesMorning)}
                  emptyLabel={
                    d.absencesMorning > 0
                      ? "يوجد غياب لكن تفاصيل الأسماء غير مُدخلة في السجل."
                      : "لا غياب مسجل للدوام الصباحي."
                  }
                />
              </div>
            ) : null}
            {d.capacityEvening > 0 ? (
              <div>
                <p className="mb-1 text-[11px] font-bold text-stone-700">الدوام المسائي — عدد الغياب: {d.absencesEvening}</p>
                <AbsenceReasonTable
                  rows={parseNameReasonLines(d.absenceNamesEvening)}
                  emptyLabel={
                    d.absencesEvening > 0
                      ? "يوجد غياب لكن تفاصيل الأسماء غير مُدخلة في السجل."
                      : "لا غياب مسجل للدوام المسائي."
                  }
                />
              </div>
            ) : null}
          </div>
        ) : (
          <AbsenceReasonTable
            rows={combinedStudentAbsences}
            emptyLabel={
              d.absencesCount > 0
                ? "يوجد غياب إجمالي لكن تفاصيل الأسماء غير مُدخلة في السجل."
                : "لا يوجد غياب مسجل."
            }
          />
        )}
      </ReportSection>

      <ReportSection title="المراقبون">
        <ReportField label="عدد المراقبين" value="— (غير متوفر في النظام حالياً)" />
        <div className="mt-2 space-y-2">
          <p className="text-[11px] font-bold text-stone-700">أسماء الغياب — المراقبون</p>
          <AbsenceReasonTable rows={[]} emptyLabel="— (غير متوفر في النظام حالياً)" />
          <p className="text-[10px] text-stone-500">عند توفر الحقل في قاعدة البيانات يُعرض هنا جدول الاسم والسبب كما في غياب الطلبة.</p>
        </div>
      </ReportSection>

      <ReportSection title="حالة الموقف والاعتماد">
        <ReportField label="حالة رفع الموقف" value={trackingStatusMonitorBadge(d, referenceTime)} />
        <ReportField label="حالة اعتماد العميد" value={deanStatusAr(d.deanStatus)} />
        <ReportField
          label="وقت رفع رئيس القسم"
          value={d.headSubmittedAtIso ? new Date(d.headSubmittedAtIso).toLocaleString("ar-IQ") : "—"}
        />
      </ReportSection>
    </div>
  );
}

function CommandKpiCard({
  value,
  label,
  semantic,
  icon,
}: {
  value: number;
  label: string;
  semantic: SemanticTone;
  icon: ReactNode;
}) {
  const bar: Record<SemanticTone, string> = {
    normal: "bg-sky-600",
    good: "bg-teal-600",
    warning: "bg-amber-500",
    danger: "bg-rose-600",
  };
  return (
    <div className="flex min-h-[86px] flex-col rounded-md border border-stone-200 bg-white shadow-sm shadow-stone-200/25 transition-[box-shadow,transform] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md sm:min-h-[90px]">
      <div className={`h-1 w-full rounded-t-md ${bar[semantic]}`} aria-hidden />
      <div className="flex flex-1 flex-col justify-center gap-2 px-3 py-2.5 sm:px-3.5 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xl font-bold tabular-nums leading-none text-[#1a3052] sm:text-2xl">{value}</p>
          <div className="shrink-0 text-sky-700/70 [&>svg]:size-6 sm:[&>svg]:size-7">{icon}</div>
        </div>
        <p className="text-[9px] font-semibold uppercase leading-snug tracking-wide text-stone-500 sm:text-[10px]">
          {label}
        </p>
      </div>
    </div>
  );
}

function IconColleges() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
      />
    </svg>
  );
}

function IconSessions() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5"
      />
    </svg>
  );
}

function IconStudents() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    </svg>
  );
}

function IconAbsence() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconReports() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function IconLate() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function CommandControlTile({
  main,
  sub,
  accent,
  pulse,
}: {
  main: string;
  sub: string;
  accent: SemanticTone | "neutral" | "time";
  pulse?: boolean;
}) {
  const stripe: Record<SemanticTone | "neutral" | "time", string> = {
    good: "bg-amber-400",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    normal: "bg-sky-400",
    neutral: "bg-stone-400",
    time: "bg-teal-400",
  };
  return (
    <div
      className={`flex min-h-[3.25rem] overflow-hidden rounded border border-white/12 bg-white/[0.07] transition-colors duration-150 hover:bg-white/[0.11] sm:min-h-[3.5rem] ${pulse ? "motion-safe:animate-pulse" : ""}`}
    >
      <div className={`w-0.5 shrink-0 sm:w-1 ${stripe[accent]}`} aria-hidden />
      <div className="min-w-0 flex-1 px-2 py-1.5 sm:px-2.5 sm:py-2">
        <p className="text-[11px] font-semibold leading-tight text-white sm:text-xs">{main}</p>
        <p className="mt-0.5 line-clamp-2 text-[8px] font-medium uppercase leading-snug tracking-wide text-sky-100/55 sm:text-[9px]">
          {sub}
        </p>
      </div>
    </div>
  );
}

