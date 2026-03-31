"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import type { ExamSituationBundle, ExamSituationDetail } from "@/lib/college-exam-situations";
import { describeCapacityByShiftAr, mergeAbsenceNamesByShift } from "@/lib/capacity-by-shift-ar";
import {
  buildExamSituationBundleReportHtml,
  buildExamSituationReportHtml,
} from "@/lib/college-exam-situation-report-html";
import type { StudyType } from "@/lib/college-study-subjects";
import { canUploadSituationInExamWindow, formatSituationWindowHintAr } from "@/lib/exam-situation-window";
import {
  approveDeanSituationAction,
  patchRoomAttendanceForSituationAction,
  submitHeadSituationAction,
  type SituationActionState,
} from "../actions";

const STUDY_TYPE_AR: Record<StudyType, string> = {
  ANNUAL: "سنوي",
  SEMESTER: "فصلي",
  COURSES: "بالمقررات",
  BOLOGNA: "بولونيا",
};

const WORKFLOW_LABEL: Record<ExamSituationDetail["workflow_status"], string> = {
  DRAFT: "مسودة",
  SUBMITTED: "مرفوع للمتابعة",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
};

/** لون النظام الأساسي — عناوين الأقسام والأيقونات والحدود التمييزية */
const PRIMARY = "#1E3A8A";

/** اسم الجامعة في الشريط الرسمي (يتوافق مع تقارير النظام) */
const UNIVERSITY_DISPLAY_NAME_AR = "جامعة البصرة";

/** شريط جانبي بطاقات «ملخص الجلسة الامتحانية» */
const SUMMARY_STAT_SIDE_ACCENT = "#F14917";

/** إطار حقل «عدد المقاعد الكلي» في قسم القاعة */
const HALL_SEATS_FIELD_ACCENT = "#F2441D";

/** تنبيهات بطاقة «الحضور والغياب» (حد وخلفية مميزة) */
const ATTENDANCE_ALERT_ACCENT = "#EB4C1B";

function situationReportGeneratedAtLabel() {
  try {
    return new Date().toLocaleString("ar-IQ", {
      timeZone: "Asia/Baghdad",
      dateStyle: "full",
      timeStyle: "short",
    });
  } catch {
    return new Date().toISOString();
  }
}

function openSituationPrintWindow(html: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  try {
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    const runPrint = () => {
      try {
        w.print();
      } catch {
        window.alert("تعذر بدء الطباعة. جرّب متصفحاً آخر أو أعد المحاولة.");
      }
    };
    if (w.document.readyState === "complete") {
      window.setTimeout(runPrint, 120);
    } else {
      w.addEventListener("load", () => window.setTimeout(runPrint, 120), { once: true });
    }
    return true;
  } catch {
    try {
      w.close();
    } catch {
      /* ignore */
    }
    return false;
  }
}

const cardLift =
  "shadow-[0_2px_6px_-2px_rgba(15,23,42,0.06),0_12px_32px_-12px_rgba(30,58,138,0.12)]";

function formatDuration(minutes: number) {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} ساعة و${m} دقيقة`;
  if (h > 0) return h === 1 ? "ساعة واحدة" : `${h} ساعات`;
  return `${m} دقيقة`;
}

/** عدّ الأسماء من أسطر أو فواصل (إنجليزية/عربية/فاصلة منقوطة). */
function countParsedAbsenceNames(text: string): number {
  const raw = text.trim();
  if (!raw) return 0;
  return raw
    .split(/[\n\r،,;؛]+/u)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

type AttendanceRateTier = "good" | "medium" | "weak";

function attendanceRateTier(rate: number | null): AttendanceRateTier | null {
  if (rate === null) return null;
  if (rate >= 75) return "good";
  if (rate >= 50) return "medium";
  return "weak";
}

function IconClipboard(props: { className?: string }) {
  return (
    <svg className={props.className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSeal(props: { className?: string }) {
  return (
    <svg className={props.className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l2 2 3-.5.5 3 2 2-2 2 .5 3-3 .5-2 2-2-2-3 .5-.5-3-2-2 2-2-.5-3 3-.5 2-2z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconWarningTriangle(props: { className?: string }) {
  return (
    <svg className={props.className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCircleCheck(props: { className?: string }) {
  return (
    <svg className={props.className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SectionCard({
  icon,
  title,
  children,
  className = "",
  titleBarStyle = "default",
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
  /** default: شريط علوي متدرج | sidebar: أزرق لوحة التحكم (#274092 / #1f3578) */
  titleBarStyle?: "default" | "sidebar";
}) {
  if (titleBarStyle === "sidebar") {
    return (
      <div
        className={`relative overflow-hidden rounded-[22px] border border-slate-200/90 bg-white ${cardLift} ${className}`}
      >
        <div className="border-b border-[#1f3578] bg-[#274092] px-5 py-4 sm:px-6 sm:py-[1.125rem]">
          <h2 className="flex items-center gap-3 text-base font-extrabold tracking-tight text-white sm:text-[1.07rem]">
            <span className="flex shrink-0 items-center text-white [&_svg]:shrink-0">{icon}</span>
            <span className="leading-snug">{title}</span>
          </h2>
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col p-5 sm:p-6">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-[22px] border border-slate-200/90 bg-white p-5 sm:p-6 ${cardLift} ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-[#1E3A8A] via-[#2563EB] to-[#60A5FA] opacity-[0.92]"
        aria-hidden
      />
      <h2 className="relative mb-5 flex items-center gap-3 pt-0.5 text-base font-extrabold tracking-tight text-[#0F172A] sm:text-[1.07rem]">
        <span className="flex shrink-0 items-center text-[#1E3A8A] [&_svg]:shrink-0">{icon}</span>
        <span className="leading-snug" style={{ color: PRIMARY }}>
          {title}
        </span>
      </h2>
      <div className="relative">{children}</div>
    </div>
  );
}

function ReadOnlyStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border border-slate-200/85 bg-gradient-to-b from-white to-[#F8FAFC] px-3 py-3 shadow-sm ring-1 ring-slate-100/60"
      style={{ borderInlineStart: `3px solid ${SUMMARY_STAT_SIDE_ACCENT}` }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#1E3A8A]/70">{label}</p>
      <p className="mt-1 text-sm font-bold leading-snug text-slate-900">{value}</p>
    </div>
  );
}

/** ملخص الجلسة: نظام دراسي + نوع امتحان — سطر واحد يفصل بين القيم خط أفقي قصير */
function ReadOnlyStudySystemAndExamTypeStat({
  label,
  studySystemValue,
  examTypeValue,
}: {
  label: string;
  studySystemValue: string;
  examTypeValue: string;
}) {
  return (
    <div
      className="rounded-xl border border-slate-200/85 bg-gradient-to-b from-white to-[#F8FAFC] px-3 py-3 shadow-sm ring-1 ring-slate-100/60"
      style={{ borderInlineStart: `3px solid ${SUMMARY_STAT_SIDE_ACCENT}` }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#1E3A8A]/70">{label}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 text-sm font-bold leading-snug text-slate-900">
        <span className="min-w-0">{studySystemValue}</span>
        <span className="h-px w-8 shrink-0 bg-slate-200/95" aria-hidden />
        <span className="min-w-0">{examTypeValue}</span>
      </p>
    </div>
  );
}

export function SituationDetailClient({
  bundle,
  collegeLabel,
  deanName,
}: {
  bundle: ExamSituationBundle;
  collegeLabel: string;
  deanName: string;
}) {
  const router = useRouter();
  const [activeScheduleId, setActiveScheduleId] = useState(bundle.active_schedule_id);
  const detail = useMemo(
    () => bundle.sessions.find((s) => s.schedule_id === activeScheduleId) ?? bundle.sessions[0]!,
    [bundle.sessions, activeScheduleId]
  );
  const multiRoom = bundle.sessions.length > 1;
  const aggregates = bundle.aggregates;

  useEffect(() => {
    setActiveScheduleId(bundle.active_schedule_id);
  }, [bundle.active_schedule_id]);

  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [attendanceM, setAttendanceM] = useState(String(detail.attendance_morning));
  const [absenceM, setAbsenceM] = useState(String(detail.absence_morning));
  const [attendanceE, setAttendanceE] = useState(String(detail.attendance_evening));
  const [absenceE, setAbsenceE] = useState(String(detail.absence_evening));
  const [absenceNamesM, setAbsenceNamesM] = useState(detail.absence_names_morning);
  const [absenceNamesE, setAbsenceNamesE] = useState(detail.absence_names_evening);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setAttendanceM(String(detail.attendance_morning));
    setAbsenceM(String(detail.absence_morning));
    setAttendanceE(String(detail.attendance_evening));
    setAbsenceE(String(detail.absence_evening));
    setAbsenceNamesM(detail.absence_names_morning);
    setAbsenceNamesE(detail.absence_names_evening);
  }, [
    detail.schedule_id,
    detail.attendance_morning,
    detail.absence_morning,
    detail.attendance_evening,
    detail.absence_evening,
    detail.absence_names_morning,
    detail.absence_names_evening,
  ]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const scheduleAllowed = canUploadSituationInExamWindow(detail.exam_date, detail.start_time, detail.end_time);
  const examTypeLabel = detail.schedule_type === "FINAL" ? "نهائي" : "فصلي";
  const studySystemLabel = STUDY_TYPE_AR[detail.study_type] ?? detail.study_type;
  const canSubmitHeadByWorkflow =
    detail.workflow_status === "SUBMITTED" || detail.workflow_status === "APPROVED";

  const capM = detail.capacity_morning;
  const capE = detail.capacity_evening;
  const dualShift = capM > 0 && capE > 0;

  const attNumM = useMemo(() => {
    const n = Number.parseInt(attendanceM, 10);
    return Number.isFinite(n) ? n : NaN;
  }, [attendanceM]);
  const absNumM = useMemo(() => {
    const n = Number.parseInt(absenceM, 10);
    return Number.isFinite(n) ? n : NaN;
  }, [absenceM]);
  const attNumE = useMemo(() => {
    const n = Number.parseInt(attendanceE, 10);
    return Number.isFinite(n) ? n : NaN;
  }, [attendanceE]);
  const absNumE = useMemo(() => {
    const n = Number.parseInt(absenceE, 10);
    return Number.isFinite(n) ? n : NaN;
  }, [absenceE]);

  const attTotalNum = useMemo(() => {
    if (Number.isNaN(attNumM) || Number.isNaN(attNumE)) return NaN;
    return attNumM + attNumE;
  }, [attNumM, attNumE]);
  const absTotalNum = useMemo(() => {
    if (Number.isNaN(absNumM) || Number.isNaN(absNumE)) return NaN;
    return absNumM + absNumE;
  }, [absNumM, absNumE]);

  const capacityMismatch = useMemo(() => {
    if (dualShift) {
      if (Number.isNaN(attNumM) || Number.isNaN(absNumM) || Number.isNaN(attNumE) || Number.isNaN(absNumE)) {
        return false;
      }
      if (capM > 0 && attNumM + absNumM !== capM) return true;
      if (capE > 0 && attNumE + absNumE !== capE) return true;
      return false;
    }
    if (capM > 0 && capE <= 0) {
      if (Number.isNaN(attNumM) || Number.isNaN(absNumM)) return false;
      return attNumM + absNumM !== capM;
    }
    if (capE > 0 && capM <= 0) {
      if (Number.isNaN(attNumE) || Number.isNaN(absNumE)) return false;
      return attNumE + absNumE !== capE;
    }
    const cap = detail.capacity_total;
    if (cap <= 0) return false;
    if (Number.isNaN(attTotalNum) || Number.isNaN(absTotalNum)) return false;
    return attTotalNum + absTotalNum !== cap;
  }, [
    dualShift,
    capM,
    capE,
    attNumM,
    absNumM,
    attNumE,
    absNumE,
    attTotalNum,
    absTotalNum,
    detail.capacity_total,
  ]);

  const absenceWithoutNames = useMemo(() => {
    if (capM > 0 && !Number.isNaN(absNumM) && absNumM > 0 && absenceNamesM.trim().length === 0) return true;
    if (capE > 0 && !Number.isNaN(absNumE) && absNumE > 0 && absenceNamesE.trim().length === 0) return true;
    return false;
  }, [capM, capE, absNumM, absNumE, absenceNamesM, absenceNamesE]);

  const attendanceRate =
    detail.capacity_total > 0 && !Number.isNaN(attTotalNum)
      ? Math.min(100, Math.max(0, Math.round((attTotalNum / detail.capacity_total) * 100)))
      : null;

  const rateTier = useMemo(() => attendanceRateTier(attendanceRate), [attendanceRate]);

  const parsedAbsenceNameCount = useMemo(
    () => countParsedAbsenceNames(absenceNamesM) + countParsedAbsenceNames(absenceNamesE),
    [absenceNamesM, absenceNamesE]
  );

  const capacityByShift = useMemo(
    () =>
      describeCapacityByShiftAr(
        detail.capacity_morning,
        detail.capacity_evening,
        detail.capacity_total
      ),
    [detail.capacity_morning, detail.capacity_evening, detail.capacity_total]
  );

  /** تفاصيل مطابقة للحقول المعروضة (قبل الحفظ) لتقرير الطباعة */
  const detailForPrint = useMemo((): ExamSituationDetail => {
    const aM = !Number.isNaN(attNumM) ? attNumM : detail.attendance_morning;
    const bM = !Number.isNaN(absNumM) ? absNumM : detail.absence_morning;
    const aE = !Number.isNaN(attNumE) ? attNumE : detail.attendance_evening;
    const bE = !Number.isNaN(absNumE) ? absNumE : detail.absence_evening;
    const namesM = absenceNamesM;
    const namesE = absenceNamesE;
    const attAgg = aM + aE;
    const absAgg = bM + bE;
    const namesMerged = mergeAbsenceNamesByShift(namesM, namesE);
    const cm = detail.capacity_morning;
    const ce = detail.capacity_evening;
    const useShift = cm > 0 || ce > 0;
    const shiftOk =
      (cm > 0 ? aM + bM === cm && (bM === 0 || namesM.trim().length > 0) : aM === 0 && bM === 0) &&
      (ce > 0 ? aE + bE === ce && (bE === 0 || namesE.trim().length > 0) : aE === 0 && bE === 0);
    const dataComplete = useShift
      ? cm + ce > 0 && shiftOk
      : detail.capacity_total > 0 &&
        attAgg + absAgg === detail.capacity_total &&
        (absAgg === 0 || namesMerged.trim().length > 0);
    return {
      ...detail,
      attendance_count: attAgg,
      absence_count: absAgg,
      absence_names: namesMerged,
      attendance_morning: aM,
      absence_morning: bM,
      attendance_evening: aE,
      absence_evening: bE,
      absence_names_morning: namesM,
      absence_names_evening: namesE,
      is_complete: dataComplete,
    };
  }, [detail, attNumM, absNumM, attNumE, absNumE, absenceNamesM, absenceNamesE]);

  /** يطابق ما يظهر في النموذج مع ما يقرأه الخادم بعد الحفظ — يُفعّل الاعتماد عند اختلاف بسيط مع `detail.is_complete`. */
  const deanApproveDataOk = detail.is_complete || detailForPrint.is_complete;

  const runAttendancePatch = useCallback(
    async (opts?: { silentSuccess?: boolean }): Promise<boolean> => {
      const fd = new FormData();
      fd.set("schedule_id", detail.schedule_id);
      if (detail.capacity_morning > 0 && detail.capacity_evening > 0) {
        fd.set("attendance_morning", attendanceM);
        fd.set("absence_morning", absenceM);
        fd.set("attendance_evening", attendanceE);
        fd.set("absence_evening", absenceE);
        fd.set("absence_names_morning", absenceNamesM);
        fd.set("absence_names_evening", absenceNamesE);
      } else {
        const ac =
          detail.capacity_evening > 0 && detail.capacity_morning <= 0 ? attendanceE : attendanceM;
        const ab = detail.capacity_evening > 0 && detail.capacity_morning <= 0 ? absenceE : absenceM;
        const names =
          detail.capacity_evening > 0 && detail.capacity_morning <= 0 ? absenceNamesE : absenceNamesM;
        fd.set("attendance_count", ac);
        fd.set("absence_count", ab);
        fd.set("absence_names", names);
      }
      const res: SituationActionState = await patchRoomAttendanceForSituationAction(null, fd);
      if (!res) return false;
      if (!res.ok) {
        setToast({ type: "err", msg: res.message });
        return false;
      }
      if (!opts?.silentSuccess) setToast({ type: "ok", msg: res.message });
      router.refresh();
      return true;
    },
    [
      absenceE,
      absenceM,
      absenceNamesE,
      absenceNamesM,
      attendanceE,
      attendanceM,
      detail.capacity_evening,
      detail.capacity_morning,
      detail.schedule_id,
      router,
    ]
  );

  const sessionsForPrint = useMemo(
    () =>
      bundle.sessions.map((s) => (s.schedule_id === detail.schedule_id ? detailForPrint : s)),
    [bundle.sessions, detail.schedule_id, detailForPrint]
  );

  const handlePrintReport = useCallback(() => {
    const gen = situationReportGeneratedAtLabel();
    const html =
      bundle.sessions.length > 1
        ? buildExamSituationBundleReportHtml(sessionsForPrint, collegeLabel, deanName, gen)
        : buildExamSituationReportHtml(detailForPrint, collegeLabel, deanName, gen);
    if (!openSituationPrintWindow(html)) {
      window.alert("تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة ثم أعد المحاولة.");
    }
  }, [bundle.sessions.length, collegeLabel, deanName, detailForPrint, sessionsForPrint]);

  const flushSave = useCallback(() => {
    startTransition(() => {
      void runAttendancePatch();
    });
  }, [runAttendancePatch]);

  const scheduleDebouncedSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      flushSave();
      saveTimer.current = null;
    }, 500);
  }, [flushSave]);

  function onSubmitHead() {
    const fd = new FormData();
    fd.set("schedule_id", detail.schedule_id);
    startTransition(async () => {
      const res = await submitHeadSituationAction(null, fd);
      if (!res) return;
      if (res.ok) {
        setToast({ type: "ok", msg: res.message });
        router.refresh();
        router.push("/dashboard/college/status-followup");
      } else {
        setToast({ type: "err", msg: res.message });
      }
    });
  }

  function onApproveDean() {
    const ta = document.getElementById("dean-note") as HTMLTextAreaElement | null;
    startTransition(async () => {
      const saved = await runAttendancePatch({ silentSuccess: true });
      if (!saved) return;
      const fd = new FormData();
      fd.set("schedule_id", detail.schedule_id);
      fd.set("dean_note", ta?.value ?? "");
      const res = await approveDeanSituationAction(null, fd);
      if (!res) return;
      if (res.ok) {
        setToast({ type: "ok", msg: res.message });
        router.refresh();
      } else {
        setToast({ type: "err", msg: res.message });
      }
    });
  }

  /** أزرار/وسوم الرأس: مستطيل مفرغ، إطار أزرق رسمي، محاذاة وقياس موحّد */
  const headerOutlineActionClass =
    "inline-flex min-h-10 w-auto shrink-0 items-center justify-center whitespace-normal rounded-sm border-2 border-[#1E3A8A] bg-white px-3.5 py-2 text-center text-sm font-bold leading-tight text-[#1E3A8A] transition-colors hover:bg-[#1E3A8A]/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A8A] sm:min-h-10 sm:whitespace-nowrap sm:px-4 sm:py-0 sm:leading-none";

  /** زر الرجوع: نفس أزرق النظام (#1E3A8A)، ممتلئ مع نص أبيض */
  const headerBackLinkClass =
    "inline-flex min-h-10 w-auto shrink-0 items-center justify-center whitespace-normal rounded-sm border-2 border-[#1E3A8A] bg-[#1E3A8A] px-3.5 py-2 text-center text-sm font-bold leading-tight text-white transition-colors hover:border-[#163170] hover:bg-[#163170] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A8A] sm:min-h-10 sm:whitespace-nowrap sm:px-4 sm:py-0 sm:leading-none";

  /** شريط العام الدراسي أسفل أزرار الرأس — نفس إطار/زوايا أزرار المخطط، بعرض عمود الأزرار */
  const headerAcademicYearStripClass =
    "flex min-h-10 w-full items-center justify-center rounded-sm border-2 border-[#1E3A8A] bg-white px-3.5 py-2 text-center text-sm font-bold leading-tight text-[#1E3A8A] sm:min-h-10 sm:px-4 sm:py-2 sm:leading-snug";

  const academicYearDisplay = detail.academic_year?.trim() ? detail.academic_year.trim() : "—";

  return (
    <section className="min-w-0 p-4 pb-10 sm:p-6 sm:pb-12" dir="rtl">
      <div className="mx-auto max-w-[min(100%,1400px)] space-y-5">
        {/* Header علوي */}
        <header
          className={`relative overflow-hidden rounded-[22px] border border-slate-200/90 bg-white p-5 sm:p-6 ${cardLift}`}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-[#1E3A8A] via-[#2563EB] to-[#93C5FD]"
            aria-hidden
          />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <h1 className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xl font-extrabold tracking-tight sm:gap-x-3 sm:text-[1.7rem]">
                <span style={{ color: PRIMARY }}>رفع الموقف الامتحاني</span>
                <span className="font-extrabold text-slate-400 select-none sm:text-2xl" aria-hidden>
                  |
                </span>
                <span
                  className="min-w-0 font-extrabold"
                  style={{ color: SUMMARY_STAT_SIDE_ACCENT }}
                  title="القاعة الامتحانية"
                >
                  {detail.room_name.trim() || "قاعة"}
                </span>
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
                إدخال بيانات الحضور والغياب ورفع الموقف الرسمي المرتبط بهذا الامتحان، وفق النافذة الزمنية المعتمدة.
                <span className="mt-2 block rounded-lg border border-slate-200/80 bg-slate-50/90 px-3 py-2 text-xs text-slate-600">
                  {formatSituationWindowHintAr(detail.start_time, detail.end_time)}
                </span>
              </p>
            </div>
            <div className="flex w-full min-w-0 flex-shrink-0 flex-col gap-2 lg:w-auto lg:max-w-full">
              <div className="flex flex-wrap content-center items-center justify-end gap-2 sm:gap-2.5">
                <Link href="/dashboard/college/upload-status" className={`${headerBackLinkClass} no-underline`}>
                  ← رجوع
                </Link>
                <button
                  type="button"
                  onClick={handlePrintReport}
                  className={`${headerOutlineActionClass} cursor-pointer`}
                  title="تقرير A4 للطباعة أو الحفظ كملف PDF"
                >
                  طباعة / حفظ PDF
                </button>
                <span className={headerOutlineActionClass} title="حالة الجدول في النظام">
                  {WORKFLOW_LABEL[detail.workflow_status]}
                </span>
                {!scheduleAllowed ? (
                  <span className={headerOutlineActionClass} title="نافذة رفع الموقف حسب التوقيت المعتمد">
                    نافذة الرفع مغلقة
                  </span>
                ) : null}
              </div>
              <div className={headerAcademicYearStripClass} role="status" aria-label={`العام الدراسي ${academicYearDisplay}`}>
                <span className="tabular-nums">العام الدراسي: {academicYearDisplay}</span>
              </div>
            </div>
          </div>
        </header>

        {multiRoom ? (
          <div className={`rounded-[22px] border border-slate-200/90 bg-white px-4 py-4 sm:px-5 ${cardLift}`}>
            <p className="mb-2 text-sm font-extrabold" style={{ color: PRIMARY }}>
              نفس المادة والوقت — موزّعة على {bundle.sessions.length} قاعة
            </p>
            <p className="mb-3 text-xs text-slate-600">
              اختر القاعة لتعديل حضورها وغيابها. الإجمالي أدناه يجمع كل القاعات المرتبطة بهذه الجلسة.
            </p>
            <div className="flex flex-wrap gap-2">
              {bundle.sessions.map((s) => (
                <button
                  key={s.schedule_id}
                  type="button"
                  onClick={() => setActiveScheduleId(s.schedule_id)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                    s.schedule_id === activeScheduleId
                      ? "border-[#1E3A8A] bg-[#EFF6FF] text-[#1E3A8A]"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {s.room_name.trim() || "قاعة"}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {multiRoom ? (
          <div className={`rounded-[22px] border border-emerald-200/90 bg-emerald-50/40 px-5 py-4 sm:px-6 ${cardLift}`}>
            <p className="mb-3 text-sm font-extrabold text-emerald-900">إجمالي المادة على جميع القاعات (صباحي + مسائي)</p>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <ReadOnlyStat label="سعة إجمالية" value={String(aggregates.capacity_total)} />
              <ReadOnlyStat label="حضور إجمالي" value={String(aggregates.attendance_count)} />
              <ReadOnlyStat label="غياب إجمالي" value={String(aggregates.absence_count)} />
              <ReadOnlyStat
                label="أسماء الغياب (مفرّزة)"
                value={aggregates.absence_names_sorted.trim() || "—"}
              />
            </div>
            {(aggregates.capacity_morning > 0 || aggregates.capacity_evening > 0) && (
              <p className="mt-3 text-xs text-emerald-900/90">
                صباحي: سعة {aggregates.capacity_morning}، حضور {aggregates.attendance_morning}، غياب{" "}
                {aggregates.absence_morning} — مسائي: سعة {aggregates.capacity_evening}، حضور{" "}
                {aggregates.attendance_evening}، غياب {aggregates.absence_evening}
              </p>
            )}
          </div>
        ) : null}

        {/* بيانات الكلية والقسم — قبل ملخص الجلسة */}
        <div
          className={`relative overflow-hidden rounded-[22px] border border-slate-200/90 bg-white px-5 py-5 sm:px-7 sm:py-6 ${cardLift}`}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#1E3A8A] to-[#60A5FA] opacity-80"
            aria-hidden
          />
          <p className="relative text-lg font-extrabold leading-snug" style={{ color: PRIMARY }}>
            بيانات الكلية والقسم
          </p>
          <div
            className="relative mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-sm font-bold leading-relaxed text-slate-900"
            role="group"
            aria-label="بيانات الكلية والقسم والأسماء"
          >
            <span className="min-w-0">{UNIVERSITY_DISPLAY_NAME_AR}</span>
            <span className="font-extrabold text-slate-800 select-none" aria-hidden>
              |
            </span>
            <span className="min-w-0">{collegeLabel}</span>
            <span className="font-extrabold text-slate-800 select-none" aria-hidden>
              |
            </span>
            <span className="min-w-0">{detail.branch_name}</span>
            <span className="font-extrabold text-slate-800 select-none" aria-hidden>
              |
            </span>
            <span className="min-w-0">عميد الكلية : السيد ({deanName.trim() || "—"})</span>
            <span className="font-extrabold text-slate-800 select-none" aria-hidden>
              |
            </span>
            <span className="min-w-0">رئيس القسم : السيد ({detail.branch_head_name.trim() || "—"})</span>
          </div>
        </div>

        {/* بطاقة ملخص — وزن بصري أعلى من بطاقات التفاصيل */}
        <div
          className={`relative overflow-hidden rounded-[22px] border border-slate-200/90 bg-white px-5 py-6 sm:px-7 sm:py-7 ${cardLift}`}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#1E3A8A] to-[#60A5FA] opacity-80"
            aria-hidden
          />
          <p
            className="relative mb-5 text-lg font-extrabold leading-snug"
            style={{ color: PRIMARY }}
          >
            {multiRoom ? "ملخص القاعة المحددة" : "ملخص الجلسة الامتحانية"} - {detail.subject_name} - المرحلة{" "}
            {detail.stage_level} - {detail.branch_name}
          </p>
          <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            <ReadOnlyStat label="التاريخ" value={detail.exam_date} />
            <ReadOnlyStat label="الوقت" value={`${detail.start_time} – ${detail.end_time}`} />
            <ReadOnlyStat label="مدة الامتحان" value={formatDuration(detail.duration_minutes)} />
            <ReadOnlyStat label="القاعة" value={detail.room_name} />
            <ReadOnlyStudySystemAndExamTypeStat
              label="نوع الامتحان والنظام الدراسي"
              studySystemValue={studySystemLabel}
              examTypeValue={examTypeLabel}
            />
          </div>
        </div>

        {/* Grid 12 أعمدة — بطاقات التفاصيل أوضح أقل من الملخص والاعتماد */}
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          {/* المشرفون والمراقبون: مقاعد القاعة + القاعة والمشرف والمراقبون */}
          <div className="col-span-12">
            <SectionCard icon={<IconSeal className="h-5 w-5" />} title="المشرفون والمراقبون" titleBarStyle="sidebar">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-8">
                <div className="min-w-0 lg:col-span-4">
                  <div
                    className="w-full rounded-xl border-2 bg-gradient-to-b from-white to-[#FAFBFC] px-3 py-3 shadow-sm"
                    style={{ borderColor: HALL_SEATS_FIELD_ACCENT }}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-xs font-bold text-[#1E3A8A]/75">
                        عدد المقاعد الكلي (من إدارة القاعات)
                      </p>
                      <p className="text-[11px] font-semibold leading-snug text-slate-600">
                        توزيع الدوام:{" "}
                        <span className="font-bold text-slate-800">{capacityByShift.modeLabelAr}</span>
                      </p>
                    </div>
                    <div className="mt-3 flex flex-row flex-nowrap gap-2 overflow-x-auto pb-0.5 sm:overflow-visible">
                      {capacityByShift.detailRows.map((row, idx) => (
                        <div
                          key={`${idx}-${row.labelAr}`}
                          className="flex min-w-[7.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-200/80 bg-white/90 px-2 py-2.5 text-center shadow-sm sm:min-w-0 sm:flex-1 sm:px-3"
                        >
                          <span className="text-[10px] font-medium leading-tight text-slate-600 sm:text-[11px]">
                            {row.labelAr}
                          </span>
                          <span className="text-sm font-bold tabular-nums text-slate-900 sm:text-base">
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="min-w-0 border-t border-slate-200/80 pt-6 lg:col-span-8 lg:border-t-0 lg:border-s lg:pt-0 lg:ps-8">
                  <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-slate-200/90 pb-2">
                    <span className="shrink-0 text-sm font-extrabold text-[#1E3A8A]">القاعة الامتحانية</span>
                    <span
                      className="h-4 w-px shrink-0 bg-[#1E3A8A]/25"
                      aria-hidden
                    />
                    <span className="min-w-0 break-words text-sm font-bold text-slate-900">{detail.room_name}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,11rem)_1fr]">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1E3A8A]/75">مشرف القاعة</p>
                      <p className="mt-1.5 break-words rounded-xl border border-slate-200/85 bg-gradient-to-b from-white to-[#FAFBFC] px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm">
                        {detail.supervisor_name}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1E3A8A]/75">المراقبون</p>
                      <p className="mt-1.5 min-h-[2.75rem] whitespace-pre-wrap rounded-xl border border-slate-200/85 bg-gradient-to-b from-white to-[#FAFBFC] px-3 py-2.5 text-sm leading-relaxed text-slate-900 shadow-sm">
                        {detail.invigilators || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* الحضور والغياب — أعلى بصرياً من بطاقات القراءة فقط */}
          <div className="col-span-12">
            <SectionCard
              icon={<IconClipboard className="h-5 w-5" />}
              title="الحضور والغياب"
              titleBarStyle="sidebar"
              className="relative border-[#1E3A8A]/24 bg-gradient-to-b from-white via-white to-[#F4F7FC]/95 shadow-[0_10px_36px_-8px_rgba(30,58,138,0.18)] ring-1 ring-[#1E3A8A]/14"
            >
              <p className="mb-4 rounded-xl border border-[#1E3A8A]/12 bg-gradient-to-b from-[#F8FAFC] to-white px-4 py-3 text-xs font-medium leading-relaxed text-slate-700 ring-1 ring-slate-100/80">
                يُحفظ الحضور والغياب وأسماء الغياب مباشرة في «إدارة القاعات» لنفس القاعة. عند تسجيل سعة صباحية ومسائية، يُعبَّأ
                الحضور والغياب لكل دوام على حدة بنفس منطق صفحة إدارة القاعات.
              </p>

              {capacityMismatch ? (
                <div
                  role="alert"
                  className="mb-3 flex gap-3 rounded-xl border-2 bg-gradient-to-b from-[#EB4C1B]/20 via-[#EB4C1B]/10 to-white px-3.5 py-3 text-xs leading-relaxed text-slate-900 shadow-sm ring-1 ring-[#EB4C1B]/25"
                  style={{ borderColor: ATTENDANCE_ALERT_ACCENT }}
                >
                  <IconWarningTriangle className="h-7 w-7 shrink-0 text-[#EB4C1B]" />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <span className="font-bold" style={{ color: ATTENDANCE_ALERT_ACCENT }}>
                      تنبيه:
                    </span>{" "}
                    <span>
                      {dualShift ? (
                        <>
                          مجموع الحضور + الغياب يجب أن يساوي سعة كل دوام: الصباحي ({capM}) والمسائي ({capE}). الإجمالي الحالي
                          صباحي:{" "}
                          {!Number.isNaN(attNumM) && !Number.isNaN(absNumM) ? attNumM + absNumM : "—"}، مسائي:{" "}
                          {!Number.isNaN(attNumE) && !Number.isNaN(absNumE) ? attNumE + absNumE : "—"}.
                        </>
                      ) : (
                        <>
                          مجموع الحضور والغياب (
                          {!Number.isNaN(attTotalNum) && !Number.isNaN(absTotalNum) ? attTotalNum + absTotalNum : "—"}) لا
                          يساوي سعة القاعة لهذه المادة ({detail.capacity_total}). راجع الأرقام قبل رفع الموقف.
                        </>
                      )}
                    </span>
                  </div>
                </div>
              ) : null}
              {absenceWithoutNames ? (
                <div
                  role="alert"
                  className="mb-3 flex gap-3 rounded-xl border-2 bg-gradient-to-b from-[#EB4C1B]/20 via-[#EB4C1B]/10 to-white px-3.5 py-3 text-xs leading-relaxed text-slate-900 shadow-sm ring-1 ring-[#EB4C1B]/25"
                  style={{ borderColor: ATTENDANCE_ALERT_ACCENT }}
                >
                  <IconWarningTriangle className="h-7 w-7 shrink-0 text-[#EB4C1B]" />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <span className="font-bold" style={{ color: ATTENDANCE_ALERT_ACCENT }}>
                      تنبيه:
                    </span>{" "}
                    <span>
                      يوجد غياب مسجّل دون إدراج أسماء الطلاب الغائبين في حقل أسماء الغياب للدوام ذي الغياب.
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-4">
                {dualShift ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch">
                    <div className="flex min-h-0 flex-col rounded-2xl border border-[#1E3A8A]/18 bg-gradient-to-b from-[#EFF6FF]/80 via-white to-[#F8FAFC] p-3.5 shadow-sm ring-1 ring-[#1E3A8A]/10">
                      <p className="text-xs font-extrabold text-[#1E3A8A]">الدوام الصباحي — مقاعد معتمدة: {capM}</p>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-xs font-bold text-[#1E3A8A]/90">حضور (صباحي)</label>
                          <input
                            type="number"
                            min={0}
                            value={attendanceM}
                            onChange={(e) => setAttendanceM(e.target.value)}
                            onBlur={scheduleDebouncedSave}
                            className="h-11 w-full rounded-xl border border-[#1E3A8A]/22 bg-white px-3 text-base font-semibold text-slate-900 shadow-sm outline-none transition focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/18"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-bold text-[#1E3A8A]/90">غياب (صباحي)</label>
                          <input
                            type="number"
                            min={0}
                            value={absenceM}
                            onChange={(e) => setAbsenceM(e.target.value)}
                            onBlur={scheduleDebouncedSave}
                            className="h-11 w-full rounded-xl border border-[#1E3A8A]/22 bg-white px-3 text-base font-semibold text-slate-900 shadow-sm outline-none transition focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/18"
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex min-h-0 flex-1 flex-col">
                        <div className="mb-1 flex flex-wrap justify-between gap-2">
                          <label className="text-xs font-semibold text-slate-600">أسماء الغياب (صباحي)</label>
                          <span className="text-xs font-semibold tabular-nums text-slate-500">
                            عدد الأسماء: {countParsedAbsenceNames(absenceNamesM)}
                          </span>
                        </div>
                        <textarea
                          value={absenceNamesM}
                          onChange={(e) => setAbsenceNamesM(e.target.value)}
                          onBlur={scheduleDebouncedSave}
                          rows={5}
                          placeholder="أسماء الغائبين في الدوام الصباحي..."
                          className="min-h-[7.5rem] w-full flex-1 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-900 shadow-sm outline-none transition focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/20"
                        />
                      </div>
                    </div>
                    <div className="flex min-h-0 flex-col rounded-2xl border border-[#1E3A8A]/18 bg-gradient-to-b from-[#EFF6FF]/80 via-white to-[#F8FAFC] p-3.5 shadow-sm ring-1 ring-[#1E3A8A]/10">
                      <p className="text-xs font-extrabold text-[#1E3A8A]">الدوام المسائي — مقاعد معتمدة: {capE}</p>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-xs font-bold text-[#1E3A8A]/90">حضور (مسائي)</label>
                          <input
                            type="number"
                            min={0}
                            value={attendanceE}
                            onChange={(e) => setAttendanceE(e.target.value)}
                            onBlur={scheduleDebouncedSave}
                            className="h-11 w-full rounded-xl border border-[#1E3A8A]/22 bg-white px-3 text-base font-semibold text-slate-900 shadow-sm outline-none transition focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/18"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-bold text-[#1E3A8A]/90">غياب (مسائي)</label>
                          <input
                            type="number"
                            min={0}
                            value={absenceE}
                            onChange={(e) => setAbsenceE(e.target.value)}
                            onBlur={scheduleDebouncedSave}
                            className="h-11 w-full rounded-xl border border-[#1E3A8A]/22 bg-white px-3 text-base font-semibold text-slate-900 shadow-sm outline-none transition focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/18"
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex min-h-0 flex-1 flex-col">
                        <div className="mb-1 flex flex-wrap justify-between gap-2">
                          <label className="text-xs font-semibold text-slate-600">أسماء الغياب (مسائي)</label>
                          <span className="text-xs font-semibold tabular-nums text-slate-500">
                            عدد الأسماء: {countParsedAbsenceNames(absenceNamesE)}
                          </span>
                        </div>
                        <textarea
                          value={absenceNamesE}
                          onChange={(e) => setAbsenceNamesE(e.target.value)}
                          onBlur={scheduleDebouncedSave}
                          rows={5}
                          placeholder="أسماء الغائبين في الدوام المسائي..."
                          className="min-h-[7.5rem] w-full flex-1 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-900 shadow-sm outline-none transition focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/20"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[#1E3A8A]/18 bg-gradient-to-b from-[#EFF6FF]/80 via-white to-[#F8FAFC] p-3.5 shadow-sm ring-1 ring-[#1E3A8A]/10">
                      <label className="mb-2 block text-xs font-bold text-[#1E3A8A]/90">
                        عدد الحضور
                        {capE > 0 && capM <= 0 ? " (مسائي)" : capM > 0 ? " (صباحي)" : ""}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={capE > 0 && capM <= 0 ? attendanceE : attendanceM}
                        onChange={(e) =>
                          capE > 0 && capM <= 0 ? setAttendanceE(e.target.value) : setAttendanceM(e.target.value)
                        }
                        onBlur={scheduleDebouncedSave}
                        className="h-11 w-full rounded-xl border border-[#1E3A8A]/22 bg-white px-3 text-base font-semibold text-slate-900 shadow-sm outline-none transition focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/18"
                      />
                    </div>
                    <div className="rounded-2xl border border-[#1E3A8A]/18 bg-gradient-to-b from-[#EFF6FF]/80 via-white to-[#F8FAFC] p-3.5 shadow-sm ring-1 ring-[#1E3A8A]/10">
                      <label className="mb-2 block text-xs font-bold text-[#1E3A8A]/90">
                        عدد الغياب
                        {capE > 0 && capM <= 0 ? " (مسائي)" : capM > 0 ? " (صباحي)" : ""}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={capE > 0 && capM <= 0 ? absenceE : absenceM}
                        onChange={(e) =>
                          capE > 0 && capM <= 0 ? setAbsenceE(e.target.value) : setAbsenceM(e.target.value)
                        }
                        onBlur={scheduleDebouncedSave}
                        className="h-11 w-full rounded-xl border border-[#1E3A8A]/22 bg-white px-3 text-base font-semibold text-slate-900 shadow-sm outline-none transition focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/18"
                      />
                    </div>
                  </div>
                )}

                <div className="w-full rounded-2xl border border-[#1E3A8A]/18 bg-gradient-to-b from-[#EFF6FF]/80 via-white to-[#F8FAFC] p-3.5 shadow-sm ring-1 ring-[#1E3A8A]/10">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#1E3A8A]/90">نسبة الحضور الإجمالية</span>
                    {attendanceRate !== null ? (
                      <span className="text-sm font-bold tabular-nums text-[#1E3A8A]">{attendanceRate}%</span>
                    ) : (
                      <span className="text-sm font-semibold text-slate-500">—</span>
                    )}
                  </div>
                  <p className="mb-2 text-[11px] leading-snug text-slate-600">من سعة القاعة ({detail.capacity_total})</p>
                  <div
                    className="h-2.5 w-full overflow-hidden rounded-full bg-[#1E3A8A]/12"
                    role="progressbar"
                    aria-valuenow={attendanceRate ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-[#1E3A8A] via-[#2563EB] to-[#60A5FA] transition-[width] duration-300"
                      style={{ width: `${attendanceRate ?? 0}%` }}
                    />
                  </div>
                  {rateTier !== null ? (
                    <p className="mt-1.5 text-[11px] font-medium text-[#1E3A8A]/75">
                      {rateTier === "good"
                        ? "نسبة جيدة"
                        : rateTier === "medium"
                          ? "نسبة متوسطة"
                          : "نسبة ضعيفة"}
                    </p>
                  ) : null}
                </div>
              </div>

              {!dualShift ? (
                <div className="mt-4">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs font-semibold text-slate-600">أسماء الغياب</label>
                    <span className="text-xs font-semibold tabular-nums text-slate-500">
                      عدد الأسماء: {parsedAbsenceNameCount}
                    </span>
                  </div>
                  <textarea
                    value={capE > 0 && capM <= 0 ? absenceNamesE : absenceNamesM}
                    onChange={(e) =>
                      capE > 0 && capM <= 0 ? setAbsenceNamesE(e.target.value) : setAbsenceNamesM(e.target.value)
                    }
                    onBlur={scheduleDebouncedSave}
                    rows={8}
                    placeholder={
                      "اكتب أسماء الطلبة الغائبين...\nكل اسم في سطر مستقل أو افصل بينهم بفاصلة"
                    }
                    className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-relaxed text-slate-900 shadow-sm outline-none transition focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/20"
                  />
                </div>
              ) : null}
              <button
                type="button"
                onClick={flushSave}
                disabled={isPending}
                className="mt-4 inline-flex h-11 items-center justify-center rounded-xl border border-[#1f3578] bg-[#274092] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2f4d9e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#274092]/45 disabled:opacity-60"
              >
                حفظ الحضور والغياب
              </button>
            </SectionCard>
          </div>

          {/* 5. الاعتماد النهائي — أبرز كتلة في الصفحة */}
          <div className="col-span-12">
            <div
              className={`relative overflow-hidden rounded-[22px] border border-[#1E3A8A]/20 bg-gradient-to-b from-[#E8EEF7] via-[#EEF2F9] to-[#E2E8F0]/90 p-6 sm:p-8 ${cardLift}`}
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-[#1E3A8A] via-[#2563EB] to-[#93C5FD]"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_100%_0%,rgba(30,58,138,0.07),transparent_55%)]"
                aria-hidden
              />
              <h2
                className="relative mb-2 flex flex-wrap items-center gap-3 text-2xl font-extrabold tracking-tight sm:text-[1.65rem]"
                style={{ color: PRIMARY }}
              >
                <IconSeal className="h-7 w-7 shrink-0 text-[#1E3A8A]" aria-hidden />
                الاعتماد النهائي ورفع الموقف الرسمي
              </h2>
              <p className="relative mb-8 max-w-3xl border-b border-[#1E3A8A]/10 pb-6 text-sm font-semibold leading-relaxed text-slate-700">
                الترتيب المعتمد: بعد اكتمال الحضور والغياب يتم <strong>اعتماد الموقف</strong> من العميد أو المعاون
                العلمي، ثم يُفعّل <strong>تأكيد رفع الموقف</strong> خلال نافذة الامتحان؛ بعد الرفع يظهر الموقف في
                صفحة «متابعة المواقف».
              </p>

              <div className="relative grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
                <div
                  className={`rounded-[20px] border-2 border-[#1E3A8A]/20 bg-white p-5 shadow-sm sm:p-6 ${cardLift}`}
                >
                  <p className="text-xs font-extrabold uppercase tracking-wide text-[#1E3A8A]">
                    الخطوة 1 — اعتماد العميد / المعاون العلمي
                  </p>
                  <p className="mt-3 rounded-lg border border-slate-200/90 bg-[#F8FAFC] px-3 py-2 text-sm text-slate-700">
                    اسم المعتمد المسجل:{" "}
                    <span className="font-bold text-[#0F172A]">{deanName || "—"}</span>
                  </p>
                  <label htmlFor="dean-note" className="mt-4 block text-xs font-bold text-[#1E3A8A]/80">
                    ملاحظات الاعتماد (اختياري)
                  </label>
                  <textarea
                    id="dean-note"
                    rows={3}
                    placeholder="ملاحظات الاعتماد (اختياري)"
                    className="mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/18"
                  />
                  <button
                    type="button"
                    onClick={onApproveDean}
                    disabled={
                      isPending ||
                      detail.dean_status === "APPROVED" ||
                      !deanApproveDataOk ||
                      !canSubmitHeadByWorkflow
                    }
                    className="mt-5 inline-flex h-11 min-w-[10rem] items-center justify-center rounded-xl border-2 border-[#1E3A8A] bg-white px-5 text-sm font-extrabold text-[#1E3A8A] shadow-sm transition hover:bg-[#EFF6FF] disabled:opacity-50"
                  >
                    اعتماد الموقف
                  </button>
                  {!canSubmitHeadByWorkflow ? (
                    <p className="mt-3 text-xs font-medium text-amber-800">
                      زر الاعتماد معطّل لأن حالة الجدول في سير العمل:{" "}
                      <strong>{WORKFLOW_LABEL[detail.workflow_status]}</strong> — يجب أن يكون «مرفوعاً للمتابعة» أو
                      «معتمداً» من صفحة الجداول الامتحانية.
                    </p>
                  ) : null}
                  {canSubmitHeadByWorkflow && !deanApproveDataOk ? (
                    <p className="mt-3 text-xs font-medium text-slate-600">
                      أكمل تطابق الحضور والغياب مع السعة وأدخل أسماء الغياب عند وجود غياب؛ عند الضغط على الاعتماد يُحفظ
                      الحضور تلقائياً ثم يُنفَّذ الاعتماد.
                    </p>
                  ) : null}
                </div>

                <div
                  className={`rounded-[20px] border border-slate-200/90 bg-white/95 p-5 shadow-sm backdrop-blur-sm sm:p-6 ${cardLift}`}
                >
                  <p className="text-xs font-extrabold uppercase tracking-wide text-[#1E3A8A]">
                    الخطوة 2 — تأكيد رفع الموقف الرسمي
                  </p>
                  <p className="mt-3 text-sm text-slate-700">
                    حالة الرفع:{" "}
                    <strong className="text-slate-900">{detail.is_uploaded ? "مرفوع" : "غير مرفوع"}</strong>
                    {detail.dean_status === "APPROVED" ? (
                      <span className="me-2 text-sm font-bold text-[#1E3A8A]">· معتمد من الإدارة</span>
                    ) : null}
                  </p>

                  <div
                    className="mt-4 flex gap-3 rounded-xl border border-[#1E3A8A]/18 bg-gradient-to-b from-[#EFF6FF]/95 to-white p-4 shadow-sm ring-1 ring-[#1E3A8A]/10"
                    role="alert"
                  >
                    <IconWarningTriangle className="h-6 w-6 flex-shrink-0 text-[#1E3A8A]" />
                    <div className="min-w-0 space-y-2.5 text-xs font-medium leading-relaxed text-slate-800">
                      <p className="text-sm font-extrabold text-[#1E3A8A]">تنبيه قبل التأكيد</p>
                      <p>
                        لا يُفعّل «تأكيد رفع الموقف» إلا بعد <strong>اعتماد الموقف</strong> من العميد أو المعاون
                        العلمي. راجع تطابق الحضور والغياب مع السعة وأسماء الغياب عند وجود غياب.
                      </p>
                      {detail.dean_status !== "APPROVED" && !detail.is_uploaded ? (
                        <p className="rounded-lg border border-[#1E3A8A]/15 bg-white/90 px-2 py-1.5 text-slate-800 shadow-sm">
                          أكمل البيانات ثم استخدم «اعتماد الموقف» في الخطوة 1؛ بعدها يصبح زر التأكيد متاحاً (مع بقية
                          الشروط).
                        </p>
                      ) : null}
                      {!scheduleAllowed ? (
                        <p className="rounded-lg border border-[#1E3A8A]/15 bg-white/90 px-2 py-1.5 text-slate-800 shadow-sm">
                          النافذة الزمنية لرفع الموقف غير مفتوحة حالياً.
                        </p>
                      ) : null}
                      {!canSubmitHeadByWorkflow ? (
                        <p className="rounded-lg border border-[#1E3A8A]/15 bg-white/90 px-2 py-1.5 text-slate-800 shadow-sm">
                          تأكيد رفع الموقف متاح فقط عندما يكون الجدول «مرفوعاً للمتابعة» أو «معتمداً» في صفحة الجداول
                          الامتحانية. يمكنك حفظ الحضور والغياب مسبقاً.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onSubmitHead}
                    disabled={
                      isPending ||
                      !scheduleAllowed ||
                      !canSubmitHeadByWorkflow ||
                      detail.is_uploaded ||
                      detail.dean_status !== "APPROVED"
                    }
                    className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-[#1E3A8A] px-8 text-base font-extrabold text-white shadow-[0_4px_16px_-2px_rgba(30,58,138,0.45)] transition hover:bg-[#163170] hover:shadow-[0_8px_22px_-4px_rgba(30,58,138,0.55)] active:scale-[0.995] disabled:pointer-events-none disabled:opacity-45 sm:w-auto sm:min-w-[320px]"
                  >
                    <IconCircleCheck className="h-6 w-6 shrink-0 opacity-95" aria-hidden />
                    تأكيد رفع الموقف
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-[300] max-w-[min(92vw,24rem)] -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-semibold shadow-[0_8px_30px_-4px_rgba(15,23,42,0.35)] ${
            toast.type === "ok" ? "border border-white/20 bg-[#1E3A8A] text-white" : "bg-red-700 text-white"
          }`}
        >
          {toast.msg}
        </div>
      ) : null}
    </section>
  );
}
