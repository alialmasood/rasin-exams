"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import type { ExamSituationDetail } from "@/lib/college-exam-situations";
import { buildExamSituationReportHtml } from "@/lib/college-exam-situation-report-html";
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

const surfacePage =
  "min-w-0 bg-gradient-to-b from-[#E2E8F0]/75 via-[#F1F5F9] to-[#EEF2F7] bg-fixed";
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

function IconBook(props: { className?: string }) {
  return (
    <svg className={props.className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBuilding(props: { className?: string }) {
  return (
    <svg className={props.className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 21h18M6 21V7l6-4 6 4v14M9 21v-4h6v4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClock(props: { className?: string }) {
  return (
    <svg className={props.className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconDoor(props: { className?: string }) {
  return (
    <svg className={props.className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M13 4h3a2 2 0 0 1 2 2v14M13 4v16M13 4H5v16h8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M17 12v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
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
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[22px] border border-slate-200/90 bg-white p-5 sm:p-6 ${cardLift} ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-[#1E3A8A] via-[#2563EB] to-[#60A5FA] opacity-[0.92]"
        aria-hidden
      />
      <h2 className="relative mb-5 flex items-center gap-3 pt-0.5 text-base font-extrabold tracking-tight text-[#0F172A] sm:text-[1.07rem]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EFF6FF] via-white to-[#E0E7FF]/60 text-[#1E3A8A] shadow-[0_1px_2px_rgba(30,58,138,0.08)] ring-1 ring-[#1E3A8A]/12 [&_svg]:size-5">
          {icon}
        </span>
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
    <div className="rounded-xl border border-slate-200/85 border-s-[3px] border-s-[#1E3A8A]/45 bg-gradient-to-b from-white to-[#F8FAFC] px-3 py-3 shadow-sm ring-1 ring-slate-100/60">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#1E3A8A]/70">{label}</p>
      <p className="mt-1 text-sm font-bold leading-snug text-slate-900">{value}</p>
    </div>
  );
}

/** حقل عرض رسمي بلون النظام — لبطاقات بيانات المادة / الكلية */
function OfficialField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[4.75rem] flex-col justify-center rounded-xl border border-[#1E3A8A]/14 bg-gradient-to-b from-[#FAFCFF] to-white px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-[#1E3A8A]/5">
      <p className="text-[11px] font-bold leading-tight text-[#1E3A8A]/88">{label}</p>
      <p className="mt-2 text-sm font-bold leading-snug text-slate-900">{value}</p>
    </div>
  );
}

export function SituationDetailClient({
  detail,
  collegeLabel,
  deanName,
}: {
  detail: ExamSituationDetail;
  collegeLabel: string;
  deanName: string;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [attendance, setAttendance] = useState(String(detail.attendance_count));
  const [absence, setAbsence] = useState(String(detail.absence_count));
  const [absenceNames, setAbsenceNames] = useState(detail.absence_names);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const scheduleAllowed = canUploadSituationInExamWindow(detail.exam_date, detail.start_time, detail.end_time);
  const examTypeLabel = detail.schedule_type === "FINAL" ? "نهائي" : "فصلي";
  const canSubmitHeadByWorkflow =
    detail.workflow_status === "SUBMITTED" || detail.workflow_status === "APPROVED";

  const attNum = useMemo(() => {
    const n = Number.parseInt(attendance, 10);
    return Number.isFinite(n) ? n : NaN;
  }, [attendance]);
  const absNum = useMemo(() => {
    const n = Number.parseInt(absence, 10);
    return Number.isFinite(n) ? n : NaN;
  }, [absence]);

  const capacityMismatch = useMemo(() => {
    const cap = detail.capacity_total;
    if (cap <= 0) return false;
    if (Number.isNaN(attNum) || Number.isNaN(absNum)) return false;
    return attNum + absNum !== cap;
  }, [detail.capacity_total, attNum, absNum]);

  const absenceWithoutNames = useMemo(() => {
    if (Number.isNaN(absNum)) return false;
    if (absNum <= 0) return false;
    return absenceNames.trim().length === 0;
  }, [absNum, absenceNames]);

  const attendanceRate =
    detail.capacity_total > 0 && !Number.isNaN(attNum)
      ? Math.min(100, Math.max(0, Math.round((attNum / detail.capacity_total) * 100)))
      : null;

  const rateTier = useMemo(() => attendanceRateTier(attendanceRate), [attendanceRate]);

  const parsedAbsenceNameCount = useMemo(() => countParsedAbsenceNames(absenceNames), [absenceNames]);

  /** تفاصيل مطابقة للحقول المعروضة (قبل الحفظ) لتقرير الطباعة */
  const detailForPrint = useMemo((): ExamSituationDetail => {
    const a = !Number.isNaN(attNum) ? attNum : detail.attendance_count;
    const b = !Number.isNaN(absNum) ? absNum : detail.absence_count;
    const cap = detail.capacity_total;
    const names = absenceNames;
    const dataComplete = cap > 0 && a + b === cap && (b === 0 || names.trim().length > 0);
    const complete = detail.dean_status === "APPROVED" || dataComplete;
    return {
      ...detail,
      attendance_count: a,
      absence_count: b,
      absence_names: names,
      is_complete: complete,
    };
  }, [detail, attNum, absNum, absenceNames]);

  const handlePrintReport = useCallback(() => {
    const html = buildExamSituationReportHtml(
      detailForPrint,
      collegeLabel,
      deanName,
      situationReportGeneratedAtLabel()
    );
    if (!openSituationPrintWindow(html)) {
      window.alert("تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة ثم أعد المحاولة.");
    }
  }, [collegeLabel, deanName, detailForPrint]);

  const flushSave = useCallback(() => {
    const fd = new FormData();
    fd.set("schedule_id", detail.schedule_id);
    fd.set("attendance_count", attendance);
    fd.set("absence_count", absence);
    fd.set("absence_names", absenceNames);
    startTransition(async () => {
      const res: SituationActionState = await patchRoomAttendanceForSituationAction(null, fd);
      if (!res) return;
      if (res.ok) {
        setToast({ type: "ok", msg: res.message });
        router.refresh();
      } else {
        setToast({ type: "err", msg: res.message });
      }
    });
  }, [attendance, absence, absenceNames, detail.schedule_id, router]);

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
      } else {
        setToast({ type: "err", msg: res.message });
      }
    });
  }

  function onApproveDean() {
    const ta = document.getElementById("dean-note") as HTMLTextAreaElement | null;
    const fd = new FormData();
    fd.set("schedule_id", detail.schedule_id);
    fd.set("dean_note", ta?.value ?? "");
    startTransition(async () => {
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

  return (
    <section className={`${surfacePage} p-4 pb-10 sm:p-6 sm:pb-12`} dir="rtl">
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
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#1E3A8A]/75">واجهة رسمية</p>
              <h1
                className="text-xl font-extrabold tracking-tight sm:text-[1.7rem]"
                style={{ color: PRIMARY }}
              >
                رفع الموقف الامتحاني
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
                إدخال بيانات الحضور والغياب ورفع الموقف الرسمي المرتبط بهذا الامتحان، وفق النافذة الزمنية المعتمدة.
                <span className="mt-2 block rounded-lg border border-slate-200/80 bg-slate-50/90 px-3 py-2 text-xs text-slate-600">
                  {formatSituationWindowHintAr(detail.start_time, detail.end_time)}
                </span>
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap content-center items-center gap-2 sm:gap-2.5 lg:justify-end">
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
          </div>
        </header>

        {/* بطاقة ملخص — وزن بصري أعلى من بطاقات التفاصيل */}
        <div
          className={`relative overflow-hidden rounded-[22px] border border-slate-200/90 bg-white px-5 py-6 sm:px-7 sm:py-7 ${cardLift}`}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#1E3A8A] to-[#60A5FA] opacity-80"
            aria-hidden
          />
          <p className="relative mb-1 text-[11px] font-bold uppercase tracking-widest text-[#1E3A8A]/75">
            نظرة موجزة
          </p>
          <p className="relative mb-5 text-lg font-extrabold" style={{ color: PRIMARY }}>
            ملخص الجلسة الامتحانية
          </p>
          <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
            <ReadOnlyStat label="اسم المادة" value={detail.subject_name} />
            <ReadOnlyStat label="التاريخ" value={detail.exam_date} />
            <ReadOnlyStat label="الوقت" value={`${detail.start_time} – ${detail.end_time}`} />
            <ReadOnlyStat label="القاعة" value={detail.room_name} />
            <ReadOnlyStat label="القسم" value={detail.branch_name} />
            <ReadOnlyStat label="المرحلة" value={`المرحلة ${detail.stage_level}`} />
            <ReadOnlyStat label="نوع الامتحان" value={examTypeLabel} />
          </div>
        </div>

        {/* Grid 12 أعمدة — بطاقات التفاصيل أوضح أقل من الملخص والاعتماد */}
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          {/* 1–2: بيانات المادة + الكلية — متجاورتان، نفس الارتفاع الأدنى */}
          <div className="col-span-12 grid grid-cols-12 gap-5 lg:col-span-12 lg:grid-cols-12 lg:gap-6 lg:items-stretch">
            <div className="col-span-12 flex lg:col-span-6">
              <SectionCard
                icon={<IconBook className="h-5 w-5" />}
                title="بيانات المادة"
                className="flex h-full min-h-[19.5rem] w-full flex-col sm:min-h-[18rem]"
              >
                <div className="flex flex-1 flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <OfficialField label="اسم المادة" value={detail.subject_name} />
                    <OfficialField label="المرحلة الدراسية" value={`المرحلة ${detail.stage_level}`} />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <OfficialField
                      label="النظام الدراسي"
                      value={STUDY_TYPE_AR[detail.study_type] ?? detail.study_type}
                    />
                    <OfficialField label="نوع الامتحان" value={examTypeLabel} />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <OfficialField label="العام الدراسي" value={detail.academic_year?.trim() ? detail.academic_year : "—"} />
                    <OfficialField label="تاريخ إجراء الامتحان" value={detail.exam_date} />
                  </div>
                </div>
              </SectionCard>
            </div>

            <div className="col-span-12 flex lg:col-span-6">
              <SectionCard
                icon={<IconBuilding className="h-5 w-5" />}
                title="بيانات الكلية والقسم"
                className="flex h-full min-h-[19.5rem] w-full flex-col sm:min-h-[18rem]"
              >
                <div className="flex flex-1 flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <OfficialField label="الكلية / التشكيل" value={collegeLabel} />
                    <OfficialField label="القسم" value={detail.branch_name} />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <OfficialField label="عميد الكلية" value={deanName.trim() ? deanName : "—"} />
                    <OfficialField label="رئيس القسم" value={detail.branch_head_name} />
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>

          {/* 3. وقت الامتحان */}
          <div className="col-span-12 lg:col-span-4">
            <SectionCard icon={<IconClock className="h-5 w-5" />} title="وقت الامتحان">
              <dl className="grid grid-cols-1 gap-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <dt className="text-xs font-bold text-[#1E3A8A]/75">تاريخ الامتحان</dt>
                    <dd className="mt-1.5 rounded-xl border border-slate-200/85 bg-gradient-to-b from-white to-[#FAFBFC] px-3 py-2.5 font-bold text-slate-900 shadow-sm tabular-nums">
                      {detail.exam_date}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-bold text-[#1E3A8A]/75">مدة الامتحان</dt>
                    <dd className="mt-1.5 rounded-xl border border-slate-200/85 bg-gradient-to-b from-white to-[#FAFBFC] px-3 py-2.5 font-semibold text-slate-900 shadow-sm">
                      {formatDuration(detail.duration_minutes)}
                    </dd>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <dt className="text-xs font-bold text-[#1E3A8A]/75">وقت البداية</dt>
                    <dd className="mt-1.5 rounded-xl border border-slate-200/85 bg-gradient-to-b from-white to-[#FAFBFC] px-3 py-2.5 tabular-nums font-semibold text-slate-900 shadow-sm">
                      {detail.start_time}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-bold text-[#1E3A8A]/75">وقت الانتهاء</dt>
                    <dd className="mt-1.5 rounded-xl border border-slate-200/85 bg-gradient-to-b from-white to-[#FAFBFC] px-3 py-2.5 tabular-nums font-semibold text-slate-900 shadow-sm">
                      {detail.end_time}
                    </dd>
                  </div>
                </div>
              </dl>
            </SectionCard>
          </div>

          {/* 4. القاعة + جزء القراءة للمراقبة والسعة */}
          <div className="col-span-12 lg:col-span-8">
            <SectionCard icon={<IconDoor className="h-5 w-5" />} title="القاعة الامتحانية">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-bold text-[#1E3A8A]/75">القاعة</p>
                  <p className="mt-1.5 rounded-xl border border-slate-200/85 bg-gradient-to-b from-white to-[#FAFBFC] px-3 py-2.5 text-sm font-bold text-slate-900 shadow-sm">
                    {detail.room_name}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#1E3A8A]/75">مشرف القاعة</p>
                  <p className="mt-1.5 rounded-xl border border-slate-200/85 bg-gradient-to-b from-white to-[#FAFBFC] px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm">
                    {detail.supervisor_name}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#1E3A8A]/75">المراقبون</p>
                  <p className="mt-1.5 min-h-[2.75rem] whitespace-pre-wrap rounded-xl border border-slate-200/85 bg-gradient-to-b from-white to-[#FAFBFC] px-3 py-2.5 text-sm leading-relaxed text-slate-900 shadow-sm">
                    {detail.invigilators || "—"}
                  </p>
                </div>
                <div className="sm:col-span-3">
                  <p className="text-xs font-bold text-[#1E3A8A]/75">عدد المقاعد الكلي (من إدارة القاعات)</p>
                  <p className="mt-1.5 rounded-xl border border-slate-200/85 bg-gradient-to-b from-white to-[#FAFBFC] px-3 py-2.5 text-sm font-bold tabular-nums text-slate-900 shadow-sm">
                    {detail.capacity_total}
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* الحضور والغياب — أعلى بصرياً من بطاقات القراءة فقط */}
          <div className="col-span-12">
            <SectionCard
              icon={<IconClipboard className="h-5 w-5" />}
              title="الحضور والغياب"
              className="relative border-[#1E3A8A]/24 bg-gradient-to-b from-white via-white to-[#F4F7FC]/95 p-6 shadow-[0_10px_36px_-8px_rgba(30,58,138,0.18)] ring-1 ring-[#1E3A8A]/14 sm:p-7"
            >
              <p className="mb-4 rounded-xl border border-[#1E3A8A]/12 bg-gradient-to-b from-[#F8FAFC] to-white px-4 py-3 text-xs font-medium leading-relaxed text-slate-700 ring-1 ring-slate-100/80">
                يُحفظ الحضور والغياب وأسماء الغياب مباشرة في «إدارة القاعات» لنفس القاعة المرتبطة بهذا الامتحان.
              </p>

              {capacityMismatch ? (
                <div className="mb-3 flex gap-2 rounded-xl border border-[#1E3A8A]/22 bg-gradient-to-b from-[#EFF6FF]/90 to-white px-3 py-2 text-xs text-slate-800 ring-1 ring-[#1E3A8A]/10">
                  <span className="font-bold text-[#1E3A8A]">تنبيه:</span>
                  <span>
                    مجموع الحضور والغياب ({!Number.isNaN(attNum) && !Number.isNaN(absNum) ? attNum + absNum : "—"}) لا يساوي سعة القاعة (
                    {detail.capacity_total}). راجع الأرقام قبل رفع الموقف.
                  </span>
                </div>
              ) : null}
              {absenceWithoutNames ? (
                <div className="mb-3 flex gap-2 rounded-xl border border-[#1E3A8A]/22 bg-gradient-to-b from-[#EFF6FF]/90 to-white px-3 py-2 text-xs text-slate-800 ring-1 ring-[#1E3A8A]/10">
                  <span className="font-bold text-[#1E3A8A]">تنبيه:</span>
                  <span>يوجد غياب مسجّل دون إدراج أسماء الطلاب الغائبين في الحقل أدناه.</span>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* بطاقات موحّدة بلون النظام وتدرّجات خفيفة */}
                <div className="rounded-2xl border border-[#1E3A8A]/18 bg-gradient-to-b from-[#EFF6FF]/80 via-white to-[#F8FAFC] p-3.5 shadow-sm ring-1 ring-[#1E3A8A]/10">
                  <label className="mb-2 block text-xs font-bold text-[#1E3A8A]/90">عدد الحضور</label>
                  <input
                    type="number"
                    min={0}
                    value={attendance}
                    onChange={(e) => setAttendance(e.target.value)}
                    onBlur={scheduleDebouncedSave}
                    className="h-11 w-full rounded-xl border border-[#1E3A8A]/22 bg-white px-3 text-base font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/18"
                  />
                </div>
                <div className="rounded-2xl border border-[#1E3A8A]/18 bg-gradient-to-b from-[#EFF6FF]/80 via-white to-[#F8FAFC] p-3.5 shadow-sm ring-1 ring-[#1E3A8A]/10">
                  <label className="mb-2 block text-xs font-bold text-[#1E3A8A]/90">عدد الغياب</label>
                  <input
                    type="number"
                    min={0}
                    value={absence}
                    onChange={(e) => setAbsence(e.target.value)}
                    onBlur={scheduleDebouncedSave}
                    className="h-11 w-full rounded-xl border border-[#1E3A8A]/22 bg-white px-3 text-base font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/18"
                  />
                </div>
                <div className="rounded-2xl border border-[#1E3A8A]/18 bg-gradient-to-b from-[#EFF6FF]/80 via-white to-[#F8FAFC] p-3.5 shadow-sm ring-1 ring-[#1E3A8A]/10">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#1E3A8A]/90">نسبة الحضور</span>
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

              <div className="mt-4">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-semibold text-slate-600">أسماء الغياب</label>
                  <span className="text-xs font-semibold tabular-nums text-slate-500">
                    عدد الأسماء: {parsedAbsenceNameCount}
                  </span>
                </div>
                <textarea
                  value={absenceNames}
                  onChange={(e) => setAbsenceNames(e.target.value)}
                  onBlur={scheduleDebouncedSave}
                  rows={8}
                  placeholder={
                    "اكتب أسماء الطلبة الغائبين...\nكل اسم في سطر مستقل أو افصل بينهم بفاصلة"
                  }
                  className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-relaxed text-slate-900 shadow-sm outline-none transition focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/20"
                />
              </div>
              <button
                type="button"
                onClick={flushSave}
                disabled={isPending}
                className="mt-4 inline-flex h-11 items-center justify-center rounded-xl border-2 border-slate-300 bg-slate-50/80 px-5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-[#1E3A8A]/35 hover:bg-white disabled:opacity-60"
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
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#1E3A8A] shadow-md ring-1 ring-[#1E3A8A]/15">
                  <IconSeal className="h-7 w-7" />
                </span>
                الاعتماد النهائي ورفع الموقف الرسمي
              </h2>
              <p className="relative mb-8 max-w-3xl border-b border-[#1E3A8A]/10 pb-6 text-sm font-semibold leading-relaxed text-slate-700">
                يُستخدم لاعتماد رفع موقف رئيس القسم ومتابعة اعتماد عميد / المعاون العلمي حسب الصلاحيات.
              </p>

              <div className="relative grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
                <div
                  className={`rounded-[20px] border border-slate-200/90 bg-white/95 p-5 shadow-sm backdrop-blur-sm sm:p-6 ${cardLift}`}
                >
                  <p className="text-sm text-slate-700">
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
                        قبل التأكيد، راجع تطابق أعداد الحضور والغياب مع سعة القاعة واستيفاء أسماء الغياب عند وجود غياب.
                      </p>
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
                      detail.dean_status === "APPROVED" ||
                      !canSubmitHeadByWorkflow
                    }
                    className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-[#1E3A8A] px-8 text-base font-extrabold text-white shadow-[0_4px_16px_-2px_rgba(30,58,138,0.45)] transition hover:bg-[#163170] hover:shadow-[0_8px_22px_-4px_rgba(30,58,138,0.55)] active:scale-[0.995] disabled:pointer-events-none disabled:opacity-45 sm:w-auto sm:min-w-[320px]"
                  >
                    <IconCircleCheck className="h-6 w-6 shrink-0 opacity-95" aria-hidden />
                    تأكيد رفع الموقف
                  </button>
                </div>

                <div
                  className={`rounded-[20px] border-2 border-[#1E3A8A]/20 bg-white p-5 shadow-sm sm:p-6 ${cardLift}`}
                >
                  <p className="text-xs font-extrabold uppercase tracking-wide text-[#1E3A8A]">
                    اعتماد العميد / المعاون العلمي
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
                    disabled={isPending || !detail.is_uploaded || detail.dean_status === "APPROVED"}
                    className="mt-5 inline-flex h-11 min-w-[10rem] items-center justify-center rounded-xl border-2 border-[#1E3A8A] bg-white px-5 text-sm font-extrabold text-[#1E3A8A] shadow-sm transition hover:bg-[#EFF6FF] disabled:opacity-50"
                  >
                    اعتماد الموقف
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
