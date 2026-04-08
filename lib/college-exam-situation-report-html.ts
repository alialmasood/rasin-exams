import { describeCapacityByShiftAr, mergeAbsenceNamesByShift } from "@/lib/capacity-by-shift-ar";
import { formatExamMealSlotLabel } from "@/lib/exam-meal-slot";
import {
  formatCollegeStudyLevelTierLabel,
  formatCollegeStudyStageLabel,
  isPostgraduateStudyStageLevel,
} from "@/lib/college-study-stage-display";
import { examScheduleLogicalGroupKeyFromRow } from "@/lib/exam-schedule-logical-group";
import { formatExamClock12hAr } from "@/lib/exam-situation-window";
import type { ExamSituationDetail } from "@/lib/college-exam-situations";
import {
  formatInvigilatorsForSituationReport,
  formatSupervisorForSituationReport,
} from "@/lib/room-external-staff";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function splitLines(names: string): string[] {
  return names
    .split(/[,،;|\n\r]+/u)
    .map((x) => x.trim())
    .filter(Boolean);
}

function formatDurationAr(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} ساعة و${m} دقيقة`;
  if (h > 0) return h === 1 ? "ساعة واحدة" : `${h} ساعات`;
  return `${m} دقيقة`;
}

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("ar-IQ", {
      timeZone: "Asia/Baghdad",
      dateStyle: "full",
      timeStyle: "short",
    });
  } catch {
    return String(d);
  }
}

function situationStaffAbsenceTableRows(detail: ExamSituationDetail): string {
  const s = detail.situation_staff_absences;
  const z = escapeHtml;
  const out: string[] = [];
  if (s.supervisor_absent && s.supervisor_absence_reason.trim() && s.supervisor_substitute_name.trim()) {
    out.push(
      `<tr><td colspan="2">تسجيل غياب مشرف القاعة</td><td colspan="2">السبب: ${z(s.supervisor_absence_reason)} — المشرف البديل: ${z(s.supervisor_substitute_name)}</td></tr>`
    );
  }
  for (const inv of s.invigilator_absences) {
    if (!inv.absent_name.trim()) continue;
    out.push(
      `<tr><td colspan="2">تسجيل غياب مراقب</td><td colspan="2">الغائب: ${z(inv.absent_name)} — السبب: ${z(inv.absence_reason)} — البديل: ${z(inv.substitute_name)}</td></tr>`
    );
  }
  return out.join("\n");
}

function hasSituationStaffAbsencesForReport(detail: ExamSituationDetail): boolean {
  const s = detail.situation_staff_absences;
  if (s.supervisor_absent && s.supervisor_absence_reason.trim() && s.supervisor_substitute_name.trim()) {
    return true;
  }
  return s.invigilator_absences.some((x) => x.absent_name.trim());
}

/** نص HTML مُهرب لعرض غياب المشرف/المراقبين في التقارير والجداول. */
function situationStaffAbsencesReportBlockHtml(detail: ExamSituationDetail, z: typeof escapeHtml): string {
  const s = detail.situation_staff_absences;
  const parts: string[] = [];
  if (s.supervisor_absent && s.supervisor_absence_reason.trim() && s.supervisor_substitute_name.trim()) {
    const supName = (detail.supervisor_name ?? "").trim() || "—";
    parts.push(
      `<strong>غياب مشرف القاعة</strong> (المسجّل: ${z(supName)}) — <strong>السبب:</strong> ${z(s.supervisor_absence_reason)} — <strong>المشرف البديل:</strong> ${z(s.supervisor_substitute_name)}`
    );
  }
  for (const inv of s.invigilator_absences) {
    if (!inv.absent_name.trim()) continue;
    parts.push(
      `<strong>غياب مراقب</strong> (${z(inv.absent_name)}) — <strong>السبب:</strong> ${z(inv.absence_reason)} — <strong>المراقب البديل:</strong> ${z(inv.substitute_name)}`
    );
  }
  if (parts.length === 0) return `<span class="muted">—</span>`;
  return `<div style="font-size:12px;line-height:1.5">${parts.join("<br/><br/>")}</div>`;
}

function hasSituationCheatingForReport(detail: ExamSituationDetail): boolean {
  const ch = detail.situation_cheating_cases;
  if (!ch?.cheating_reported) return false;
  return ch.cases.some((c) => c.student_name.trim().length >= 2 && c.notes.trim().length >= 2);
}

function situationCheatingReportBlockHtml(detail: ExamSituationDetail, z: typeof escapeHtml): string {
  const ch = detail.situation_cheating_cases;
  const parts: string[] = [];
  for (const c of ch.cases) {
    if (c.student_name.trim().length < 2 || c.notes.trim().length < 2) continue;
    parts.push(
      `<strong>الطالب:</strong> ${z(c.student_name.trim())} — <strong>ملاحظات:</strong> ${z(c.notes.trim())}`
    );
  }
  if (parts.length === 0) return `<span class="muted">—</span>`;
  return `<div style="font-size:12px;line-height:1.5">${parts.join("<br/><br/>")}</div>`;
}

function situationCheatingAttendanceAppendix(detail: ExamSituationDetail, z: typeof escapeHtml): string {
  if (!hasSituationCheatingForReport(detail)) return "";
  const lines: string[] = [];
  for (const c of detail.situation_cheating_cases.cases) {
    if (c.student_name.trim().length < 2 || c.notes.trim().length < 2) continue;
    lines.push(
      `<strong>الطالب:</strong> ${z(c.student_name.trim())} — <strong>ملاحظات:</strong> ${z(c.notes.trim())}`
    );
  }
  if (lines.length === 0) return "";
  return `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #d1d5db"><strong style="color:#b45309">حالات الغش:</strong><br/><br/>${lines.join("<br/><br/>")}</div>`;
}

const SCHEDULE_TYPE_AR: Record<ExamSituationDetail["schedule_type"], string> = {
  FINAL: "جدول امتحانات نهائية",
  SEMESTER: "جدول امتحانات فصلية",
};

/** نص مختصر لعمود التقرير الرسمي */
function scheduleExamKindShortAr(t: ExamSituationDetail["schedule_type"]): string {
  return t === "SEMESTER" ? "امتحان فصلي" : "امتحان نهائي";
}

const WORKFLOW_AR: Record<ExamSituationDetail["workflow_status"], string> = {
  DRAFT: "مسودة",
  SUBMITTED: "مرفوع للمتابعة",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
};

const STUDY_TYPE_AR: Record<ExamSituationDetail["study_type"], string> = {
  ANNUAL: "سنوي",
  SEMESTER: "فصلي",
  COURSES: "مقررات",
  BOLOGNA: "بولونيا",
  INTEGRATIVE: "تكاملي",
};

const DEAN_AR: Record<ExamSituationDetail["dean_status"], string> = {
  NONE: "لم يُعتمد بعد",
  PENDING: "قيد مراجعة الإدارة",
  APPROVED: "معتمد من عميد / المعاون العلمي",
  REJECTED: "مرفوض",
};

function row2(label: string, value: string): string {
  const z = escapeHtml;
  return `<tr><td>${z(label)}</td><td>${value}</td></tr>`;
}

/** تاريخ ويوم كامل (توقيت بغداد) — بدون عرض الساعة في السطر */
export function formatSituationReportDateDayLabel(d: Date): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ", {
      timeZone: "Asia/Baghdad",
      dateStyle: "full",
    }).format(d);
  } catch {
    return String(d);
  }
}

/** الساعة بتوقيت بغداد */
export function formatSituationReportTimeLabel(d: Date): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ", {
      timeZone: "Asia/Baghdad",
      timeStyle: "medium",
    }).format(d);
  } catch {
    return String(d);
  }
}

function formatSituationReportGeneratedFullLabel(d: Date): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ", {
      timeZone: "Asia/Baghdad",
      dateStyle: "full",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * طباعة / PDF — A4، تقرير حكومي، صفحتان (1: كلية+مادة، 2: موعد+حضور+اعتماد).
 * جميع البيانات محفوظة؛ التنسيق فقط.
 */
/** شعار جامعة البصرة — `public/uob-logo.png` */
const UNIVERSITY_LOGO_PATH = "/uob-logo.png";

function absoluteLogoSrc(assetsBaseUrl: string | undefined): string {
  const base = (assetsBaseUrl ?? "").trim().replace(/\/$/, "");
  return base ? `${base}${UNIVERSITY_LOGO_PATH}` : "";
}

export function buildExamSituationReportHtml(
  detail: ExamSituationDetail,
  collegeLabel: string,
  deanName: string,
  /** وقت إنشاء/طباعة التقرير — يُشتق منه التاريخ واليوم والساعة والتذييل */
  generatedAt: Date,
  /** أصل الموقع (مثل http://localhost:3000) لمسار مطلق للشعار؛ نافذة الطباعة قد تكون about:blank */
  assetsBaseUrl?: string
): string {
  const e = escapeHtml;
  const generatedLabel = formatSituationReportGeneratedFullLabel(generatedAt);
  const dateDayLabel = formatSituationReportDateDayLabel(generatedAt);
  const timeLabel = formatSituationReportTimeLabel(generatedAt);
  const logoSrc = absoluteLogoSrc(assetsBaseUrl);
  const logoHtml = logoSrc
    ? `<img src="${e(logoSrc)}" alt="شعار جامعة البصرة" class="report-logo" width="72" height="72" />`
    : "";
  const invigilatorsCell = formatInvigilatorsForSituationReport(
    detail.invigilators,
    detail.room_external_staff,
    e,
    splitLines
  );
  const absenceNamesForList = mergeAbsenceNamesByShift(
    detail.absence_names_morning ?? "",
    detail.absence_names_evening ?? ""
  );
  const absListSource =
    absenceNamesForList.trim().length > 0 ? absenceNamesForList : detail.absence_names;
  const absList = splitLines(absListSource).map((n) => `<li>${e(n)}</li>`).join("");
  const sumAttAbs = detail.attendance_count + detail.absence_count;
  const shiftAttRows =
    detail.capacity_morning > 0 || detail.capacity_evening > 0
      ? [
          detail.capacity_morning > 0
            ? `<tr><td>حضور الدوام الصباحي</td><td><strong>${detail.attendance_morning}</strong></td></tr>
        <tr><td>غياب الدوام الصباحي</td><td><strong>${detail.absence_morning}</strong></td></tr>`
            : "",
          detail.capacity_evening > 0
            ? `<tr><td>حضور الدوام المسائي</td><td><strong>${detail.attendance_evening}</strong></td></tr>
        <tr><td>غياب الدوام المسائي</td><td><strong>${detail.absence_evening}</strong></td></tr>`
            : "",
        ].join("")
      : "";
  const capShift = describeCapacityByShiftAr(
    detail.capacity_morning,
    detail.capacity_evening,
    detail.capacity_total
  );
  const capacityBreakdownRows = [
    `<tr><td>نمط توزيع المقاعد (إدارة القاعات)</td><td><strong>${e(capShift.modeLabelAr)}</strong></td></tr>`,
    ...capShift.detailRows.map(
      (r) => `<tr><td>${e(r.labelAr)}</td><td><strong>${r.value}</strong></td></tr>`
    ),
  ].join("");

  const notesBlock =
    detail.notes && detail.notes.trim().length > 0
      ? `<p class="notes-pre">${e(detail.notes.trim())}</p>`
      : `<span class="muted">لا توجد</span>`;

  const deanApprovedYesNo = detail.dean_status === "APPROVED" ? "نعم" : "لا";
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${e(detail.subject_name)} — تقرير الموقف الامتحاني</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Tajawal", "Segoe UI", Tahoma, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #111827;
      font-size: 13px;
      line-height: 1.45;
      background: #fff;
      position: relative;
    }
    .watermark {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 0;
      font-size: 64px;
      font-weight: 800;
      color: rgba(30, 58, 138, 0.045);
      transform: rotate(-28deg);
      user-select: none;
    }
    .doc-root { position: relative; z-index: 1; }

    @page { size: A4; margin: 20mm 15mm; }
    @media print {
      body { background: white !important; color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }

    .report-header {
      width: 100%;
      border-bottom: 2px solid #1e3a8a;
      padding: 8px 0 12px;
      margin-bottom: 10px;
    }
    /* صف علوي: يسار الصفحة = تاريخ، الوسط = شعار، يمين الصفحة = جامعة+كلية (اتجاه ltr للشبكة فقط) */
    .report-header-top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: start;
      gap: 14px 18px;
      direction: ltr;
    }
    .report-header-side--meta {
      text-align: start;
      direction: rtl;
      font-size: 13px;
      color: #374151;
      line-height: 1.55;
      justify-self: start;
      max-width: 100%;
    }
    .report-header-logo {
      justify-self: center;
      text-align: center;
    }
    .report-logo {
      width: 72px;
      height: 72px;
      object-fit: contain;
      display: block;
      margin-inline: auto;
    }
    @media print { .report-logo { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    .report-header-side--names {
      text-align: end;
      direction: rtl;
      font-weight: 700;
      line-height: 1.45;
      justify-self: end;
      max-width: 100%;
    }
    .report-header-side--names .uni { font-size: 15px; color: #1e3a8a; }
    .report-header-side--names .college { font-weight: 600; color: #374151; margin-top: 4px; font-size: 14px; }
    .report-header-side .meta-line { margin: 2px 0; }
    .report-header-tagline {
      text-align: center;
      margin-top: 12px;
      font-size: 18px;
      font-weight: 800;
      color: #1e3a8a;
      letter-spacing: 0.02em;
    }

    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }

    .section {
      page-break-inside: avoid;
      break-inside: avoid;
      margin-bottom: 12px;
    }

    .section-title {
      font-size: 15px;
      font-weight: 800;
      color: #1e3a8a;
      margin: 0 0 6px;
      padding-bottom: 3px;
      border-bottom: 2px solid #d1d5db;
    }

    .table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 13px;
    }
    .table td {
      border: 1px solid #ccc;
      padding: 8px;
      vertical-align: top;
      text-align: right;
    }
    .table td:first-child {
      background: #f3f4f6;
      font-weight: 700;
      width: 35%;
      color: #111827;
    }
    .table.table-4col td:first-child,
    .table.table-4col td:nth-child(3) {
      background: #f3f4f6;
      font-weight: 700;
      width: 19%;
    }
    .table.table-4col td:nth-child(2),
    .table.table-4col td:nth-child(4) {
      width: 31%;
      background: #fff;
      font-weight: 400;
    }

    .table-metric td:first-child { width: 55%; }
    .table-metric tr.metric-head td {
      background: #e5e7eb !important;
      font-weight: 800;
      text-align: center;
    }

    .list-dot { margin: 4px 0 0; padding-right: 20px; }
    .list-dot li { margin: 2px 0; }
    .muted { color: #6b7280; font-size: 12px; }
    .notes-pre { white-space: pre-wrap; margin: 0; }

    .signature-block {
      margin-top: 12px;
      padding: 10px 12px;
      border: 1px solid #ccc;
      background: #fafafa;
      font-size: 13px;
      line-height: 1.9;
    }
    .sig-field { margin: 8px 0 0; }
    .sig-line {
      border-bottom: 1px solid #6b7280;
      min-height: 20px;
      margin-top: 4px;
      max-width: 100%;
    }

    .page-footer {
      margin-top: 12px;
      padding-top: 6px;
      border-top: 1px solid #ccc;
      font-size: 11px;
      color: #4b5563;
      text-align: center;
      line-height: 1.55;
    }
    .pdf-hint {
      margin-top: 8px;
      font-size: 11px;
      color: #6b7280;
      text-align: center;
    }
    @media print { .pdf-hint { font-size: 10px; } }
  </style>
</head>
<body>
  <div class="watermark" aria-hidden="true">جامعة البصرة</div>
  <div class="doc-root">

  <header class="report-header">
    <div class="report-header-top">
      <div class="report-header-side report-header-side--meta">
        <div class="meta-line"><strong>التاريخ واليوم:</strong> ${e(dateDayLabel)}</div>
        <div class="meta-line"><strong>الساعة:</strong> ${e(timeLabel)}</div>
      </div>
      <div class="report-header-logo">${logoHtml}</div>
      <div class="report-header-side report-header-side--names">
        <div class="uni">جامعة البصرة</div>
        <div class="college">${e(collegeLabel)}</div>
      </div>
    </div>
    <div class="report-header-tagline">الموقف الامتحاني الرسمي</div>
  </header>

  <div class="page">
    <section class="section">
      <h2 class="section-title">1. بيانات الكلية والتشكيل الأكاديمي</h2>
      <table class="table">
        ${row2("الكلية / التشكيل", `<strong>${e(collegeLabel)}</strong>`)}
        ${row2("القسم / الفرع", e(detail.branch_name))}
        ${row2("عميد الكلية (المسجّل في النظام)", e(deanName.trim() || "—"))}
        ${row2("رئيس القسم", e(detail.branch_head_name))}
      </table>
    </section>
    <section class="section">
      <h2 class="section-title">2. بيانات المادة والامتحان</h2>
      <table class="table">
        ${row2("اسم المادة الامتحانية", `<strong>${e(detail.subject_name)}</strong>`)}
        ${row2("المرحلة الدراسية", formatCollegeStudyStageLabel(detail.stage_level))}
        ${row2("النظام الدراسي", e(STUDY_TYPE_AR[detail.study_type] ?? detail.study_type))}
        ${row2("نوع الجدول", e(SCHEDULE_TYPE_AR[detail.schedule_type]))}
        ${row2("العام الدراسي", e(detail.academic_year?.trim() ? detail.academic_year : "—"))}
        ${row2("حالة الجدول في سير العمل", e(WORKFLOW_AR[detail.workflow_status]))}
      </table>
    </section>
    <footer class="page-footer">
      صفحة 1 من 2 — وقت الطباعة / الإنشاء: ${e(generatedLabel)} — اسم النظام: نظام رصين لإدارة الامتحانات
    </footer>
  </div>

  <div class="page">
    <section class="section">
      <h2 class="section-title">3. الموعد والقاعة</h2>
      <table class="table table-4col">
        <tr>
          <td>تاريخ إجراء الامتحان</td>
          <td>${e(detail.exam_date)}</td>
          <td>مشرف القاعة</td>
          <td>${formatSupervisorForSituationReport(detail.supervisor_name, detail.room_external_staff, e)}</td>
        </tr>
        <tr>
          <td>رقم الوجبة</td>
          <td>${e(formatExamMealSlotLabel(detail.meal_slot))}</td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td>وقت البداية</td>
          <td>${e(detail.start_time)}</td>
          <td rowspan="3">المراقبون</td>
          <td rowspan="3">${invigilatorsCell}</td>
        </tr>
        <tr>
          <td>وقت الانتهاء</td>
          <td>${e(detail.end_time)}</td>
        </tr>
        <tr>
          <td>مدة الامتحان</td>
          <td>${e(formatDurationAr(detail.duration_minutes))}</td>
        </tr>
        ${situationStaffAbsenceTableRows(detail)}
        <tr>
          <td>اسم القاعة الامتحانية</td>
          <td colspan="3"><strong>${e(detail.room_name)}</strong></td>
        </tr>
        <tr>
          <td>معرّف القاعة في النظام</td>
          <td colspan="3"><span class="muted">${e(detail.room_id)}</span></td>
        </tr>
      </table>
    </section>

    <section class="section">
      <h2 class="section-title">4. الطاقة الاستيعابية والحضور والغياب</h2>
      <table class="table table-metric">
        <tr class="metric-head"><td>البيان</td><td>العدد</td></tr>
        ${capacityBreakdownRows}
        ${shiftAttRows}
        <tr><td>الحضور (الإجمالي)</td><td><strong>${detail.attendance_count}</strong></td></tr>
        <tr><td>الغياب (الإجمالي)</td><td><strong>${detail.absence_count}</strong></td></tr>
        <tr><td>المجموع (حضور + غياب)</td><td>${sumAttAbs}</td></tr>
        <tr><td>اكتمال البيانات (مطابقة السعة وأسماء الغياب عند الحاجة)</td><td>${detail.is_complete ? "مكتمل" : "غير مكتمل"}</td></tr>
      </table>
      <table class="table" style="margin-top:8px;">
        ${row2("أسماء الطلبة الغائبين", absList ? `<ul class="list-dot">${absList}</ul>` : `<span class="muted">لا يوجد / لم يُدرج</span>`)}
        ${hasSituationStaffAbsencesForReport(detail) ? row2("غياب المشرف أو المراقبين (السبب والبديل)", situationStaffAbsencesReportBlockHtml(detail, e)) : ""}
        ${hasSituationCheatingForReport(detail) ? row2("حالات الغش (اسم الطالب والملاحظات)", situationCheatingReportBlockHtml(detail, e)) : ""}
        ${row2("ملاحظات على الجدول (إن وُجدت)", notesBlock)}
      </table>
    </section>

    <section class="section">
      <h2 class="section-title">5. رفع الموقف والاعتماد الإداري</h2>
      <table class="table">
        ${row2("تم رفع موقف رئيس القسم من النظام", detail.is_uploaded ? "نعم" : "لا")}
        ${row2("تاريخ ووقت رفع الموقف", e(fmtDateTime(detail.head_submitted_at)))}
        ${row2("حالة اعتماد عميد الكلية / المعاون العلمي (نصّي)", e(DEAN_AR[detail.dean_status]))}
        ${row2("هل تم الاعتماد الإداري للموقف؟ (نعم / لا)", `<strong>${deanApprovedYesNo}</strong>`)}
        ${row2("تاريخ ووقت آخر مراجعة إدارية", e(fmtDateTime(detail.dean_reviewed_at)))}
        ${row2("اسم المعتمد المسجّل في النظام", e(deanName.trim() || "—"))}
      </table>
      <div class="signature-block">
        <p><strong>توقيعات الجهة المعتمدة (بعد الطباعة)</strong></p>
        <div class="sig-field">اسم المعتمد: <span class="sig-line"></span></div>
        <div class="sig-field">التوقيع: <span class="sig-line"></span></div>
        <div class="sig-field">الختم: <span class="sig-line"></span></div>
        <p class="sig-field" style="margin-top:10px"><strong>حالة الاعتماد الإداري (واضحة):</strong> ${deanApprovedYesNo} — ${e(DEAN_AR[detail.dean_status])}</p>
      </div>
    </section>

    <footer class="page-footer">
      صفحة 2 من 2 — وقت الطباعة / الإنشاء: ${e(generatedLabel)} — اسم النظام: نظام رصين لإدارة الامتحانات
    </footer>
    <p class="pdf-hint">لحفظ PDF: من نافذة الطباعة اختر «Save as PDF» أو «Microsoft Print to PDF». — يعكس التقرير البيانات وقت الإنشاء.</p>
  </div>

  </div>
</body>
</html>`;
}

function sortUniqueAbsenceNamesLocal(raw: string): string {
  const tokens = raw
    .split(/[,،;|\n\r]+/u)
    .map((t) => t.trim())
    .filter(Boolean);
  const unique = [...new Set(tokens)];
  unique.sort((a, b) => a.localeCompare(b, "ar-IQ"));
  return unique.join("، ");
}

/** تقرير موقف لمادة موزّعة على عدة قاعات — تفصيل لكل قاعة ثم إجمالي وأسماء غياب مفرّزة. */
export function buildExamSituationBundleReportHtml(
  sessions: ExamSituationDetail[],
  collegeLabel: string,
  deanName: string,
  generatedAt: Date,
  assetsBaseUrl?: string
): string {
  if (sessions.length === 0) return "";
  if (sessions.length === 1) {
    return buildExamSituationReportHtml(sessions[0]!, collegeLabel, deanName, generatedAt, assetsBaseUrl);
  }
  const e = escapeHtml;
  const generatedLabel = formatSituationReportGeneratedFullLabel(generatedAt);
  const logoSrc = absoluteLogoSrc(assetsBaseUrl);
  const bundleLogoHtml = logoSrc
    ? `<img src="${e(logoSrc)}" alt="شعار جامعة البصرة" class="bundle-report-logo" width="48" height="48" />`
    : "";
  const head = sessions[0]!;
  let capTot = 0;
  let attTot = 0;
  let absTot = 0;
  let capMTot = 0;
  let capETot = 0;
  let attMTot = 0;
  let absMTot = 0;
  let attETot = 0;
  let absETot = 0;
  const nameChunks: string[] = [];
  for (const s of sessions) {
    capTot += s.capacity_total;
    attTot += s.attendance_count;
    absTot += s.absence_count;
    capMTot += s.capacity_morning;
    capETot += s.capacity_evening;
    attMTot += s.attendance_morning;
    absMTot += s.absence_morning;
    attETot += s.attendance_evening;
    absETot += s.absence_evening;
    const merged = mergeAbsenceNamesByShift(s.absence_names_morning, s.absence_names_evening);
    const src = merged.trim() || (s.absence_names ?? "").trim();
    if (src) nameChunks.push(src);
  }
  const absenceSortedAll = sortUniqueAbsenceNamesLocal(nameChunks.join("\n"));
  const roomRows = sessions
    .map(
      (s) => `<tr>
  <td><strong>${e(s.room_name)}</strong><div class="muted" style="font-size:11px">معرّف ${e(s.schedule_id)}</div></td>
  <td>${formatSupervisorForSituationReport(s.supervisor_name ?? "", s.room_external_staff, e)}</td>
  <td>${formatInvigilatorsForSituationReport(s.invigilators, s.room_external_staff, e, splitLines)}</td>
  <td style="font-size:11px;line-height:1.45">${situationStaffAbsencesReportBlockHtml(s, e)}</td>
  <td style="font-size:12px;line-height:1.45">${attendanceCellHtml(s)}</td>
  <td>${s.is_uploaded ? "نعم" : "لا"}</td>
  <td>${e(DEAN_AR[s.dean_status])}</td>
</tr>`
    )
    .join("\n");

  const shiftTotalsRow =
    capMTot > 0 || capETot > 0
      ? `<tr class="muted"><td colspan="4"><strong>إجمالي صباحي/مسائي على كل القاعات</strong></td>
  <td style="font-size:12px"><strong>صباحي:</strong> سعة ${capMTot}، حضور ${attMTot}، غياب ${absMTot}<br/>
  <strong>مسائي:</strong> سعة ${capETot}، حضور ${attETot}، غياب ${absETot}</td>
  <td colspan="2"></td></tr>`
      : "";

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${e(head.subject_name)} — موقف متعدد القاعات</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
  <style>
    body { font-family: "Tajawal", Tahoma, sans-serif; margin: 0; padding: 16px; color: #111827; font-size: 13px; line-height: 1.45; background: #fff; }
    @page { size: A4; margin: 18mm; }
    @media print { body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    .hdr { border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 14px; }
    .hdr-top { display: flex; align-items: center; justify-content: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
    .bundle-report-logo { width: 48px; height: 48px; object-fit: contain; flex-shrink: 0; }
    @media print { .bundle-report-logo { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    .hdr h1 { margin: 0; font-size: 18px; color: #1e3a8a; text-align: right; }
    .meta { margin-top: 6px; font-size: 12px; color: #374151; }
    .table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    .table th, .table td { border: 1px solid #ccc; padding: 8px; vertical-align: top; text-align: right; }
    .table th { background: #e5e7eb; font-weight: 800; }
    .muted { color: #6b7280; }
    .list-dot { margin: 4px 0 0; padding-right: 20px; }
    .list-dot li { margin: 2px 0; }
    .box { margin-top: 14px; padding: 10px; border: 1px solid #1e3a8a; background: #f8fafc; border-radius: 8px; }
  </style>
</head>
<body>
  <header class="hdr">
    <div class="hdr-top">
      ${bundleLogoHtml}
      <h1 style="flex:1;min-width:12rem">تقرير الموقف الامتحاني — مادة موزّعة على عدة قاعات</h1>
    </div>
    <div class="meta"><strong>الكلية:</strong> ${e(collegeLabel)} — <strong>عميد الكلية (المسجّل):</strong> ${e(deanName.trim() || "—")}</div>
    <div class="meta"><strong>المادة:</strong> ${e(head.subject_name)} — <strong>المرحلة:</strong> ${e(formatCollegeStudyStageLabel(head.stage_level))} — <strong>القسم:</strong> ${e(head.branch_name)}</div>
    <div class="meta"><strong>التاريخ:</strong> ${e(head.exam_date)} — <strong>الوقت:</strong> ${e(head.start_time)} — ${e(head.end_time)} — <strong>أُنشئ:</strong> ${e(generatedLabel)}</div>
  </header>
  <table class="table">
    <thead>
      <tr>
        <th>القاعة</th>
        <th>المشرف</th>
        <th>المراقبون</th>
        <th>غياب المشرف / المراقب<br/><span style="font-weight:600">(السبب والبديل)</span></th>
        <th>الحضور والغياب (صباحي/مسائي حسب إعداد القاعة)</th>
        <th>مرفوع الموقف</th>
        <th>اعتماد الإدارة</th>
      </tr>
    </thead>
    <tbody>
      ${roomRows}
      ${shiftTotalsRow}
      <tr style="background:#eff6ff;font-weight:700">
        <td colspan="4"><strong>الإجمالي على جميع القاعات</strong></td>
        <td>سعة إجمالية ${capTot}، حضور ${attTot}، غياب ${absTot}</td>
        <td colspan="2"></td>
      </tr>
    </tbody>
  </table>
  <div class="box">
    <p style="margin:0 0 6px;font-weight:800;color:#1e3a8a">أسماء الغياب (مفرّزة من كل القاعات، بدون تكرار)</p>
    <p style="margin:0;font-size:12px;line-height:1.55">${e(absenceSortedAll) || "—"}</p>
  </div>
  <p class="muted" style="margin-top:14px;font-size:11px;text-align:center">نظام رصين — للحفظ PDF استخدم الطباعة ثم «حفظ كـ PDF».</p>
</body>
</html>`;
}

function formatExamDateLongAr(isoDate: string): string {
  try {
    const d = new Date(`${isoDate}T12:00:00`);
    return new Intl.DateTimeFormat("ar-IQ", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Baghdad",
    }).format(d);
  } catch {
    return isoDate;
  }
}

function attendanceCellHtml(detail: ExamSituationDetail): string {
  const e = escapeHtml;
  const capM = detail.capacity_morning;
  const capE = detail.capacity_evening;
  const cheatBlock = situationCheatingAttendanceAppendix(detail, e);
  if (capM > 0 || capE > 0) {
    const parts: string[] = [];
    if (capM > 0) {
      parts.push(
        `<strong>صباحي:</strong> إجمالي السعة ${capM}، حضور ${detail.attendance_morning}، غياب ${detail.absence_morning}. أسماء الغياب: ${e((detail.absence_names_morning ?? "").trim()) || "—"}`
      );
    }
    if (capE > 0) {
      parts.push(
        `<strong>مسائي:</strong> إجمالي السعة ${capE}، حضور ${detail.attendance_evening}، غياب ${detail.absence_evening}. أسماء الغياب: ${e((detail.absence_names_evening ?? "").trim()) || "—"}`
      );
    }
    return parts.join("<br/><br/>") + cheatBlock;
  }
  const names = (detail.absence_names ?? "").trim();
  return (
    `<strong>إجمالي السعة</strong> ${detail.capacity_total}، <strong>حضور</strong> ${detail.attendance_count}، <strong>غياب</strong> ${detail.absence_count}.<br/><strong>أسماء الغياب:</strong> ${e(names) || "—"}` +
    cheatBlock
  );
}

/**
 * تقرير نهائي ليوم امتحاني كامل (كل الجلسات المرفوع موقفها لذلك التاريخ).
 */
function groupExamSituationDetailsForDailyReport(details: ExamSituationDetail[]): ExamSituationDetail[][] {
  const m = new Map<string, ExamSituationDetail[]>();
  for (const d of details) {
    const k = examScheduleLogicalGroupKeyFromRow({
      college_subject_id: d.college_subject_id,
      study_subject_id: d.study_subject_id,
      stage_level: d.stage_level,
      exam_date: d.exam_date,
      start_time: d.start_time,
      end_time: d.end_time,
      schedule_type: d.schedule_type,
      meal_slot: d.meal_slot,
      academic_year: d.academic_year,
      term_label: d.term_label ?? null,
    });
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(d);
  }
  return Array.from(m.values()).map((g) =>
    [...g].sort((a, b) => a.room_name.localeCompare(b.room_name, "ar"))
  );
}

const OFFICIAL_DAILY_COLS = 15;
/** أعمدة الجدول قبل أعمدة السعة/الحضور/الغياب (لصف الإجمالي الفرعي) */
const OFFICIAL_DAILY_COLS_BEFORE_COUNTS = 7;
/** أعمدة ذيل صف الإجمالي (غياب طلاب + مشرف + مراقبون + غياب مشرف/مراقب + غش) */
const OFFICIAL_DAILY_SUBTOTAL_TAIL_COLSPAN = 5;

type DailyOfficialTotals = {
  examsUndergraduate: number;
  examsPostgraduate: number;
  distinctExamSubjects: number;
  totalRooms: number;
  totalCapacity: number;
  /** مجموع سعات الدوام الصباحي من القاعات التي لها تقسيم صباحي/مسائي */
  totalCapacityMorning: number;
  totalCapacityEvening: number;
  totalAttendance: number;
  totalAttendanceMorning: number;
  totalAttendanceEvening: number;
  totalAbsence: number;
  totalAbsenceMorning: number;
  totalAbsenceEvening: number;
  supervisorsDistinct: number;
  invigilatorsDistinct: number;
};

/** إجماليات التقرير النهائي اليومي — الامتحانات = مجموعات الجلسة المنطقية؛ المواد = متميزة بالمادة والمرحلة. */
function computeDailyOfficialReportTotals(
  details: ExamSituationDetail[],
  groups: ExamSituationDetail[][]
): DailyOfficialTotals {
  let examsUndergraduate = 0;
  let examsPostgraduate = 0;
  const subjectKeys = new Set<string>();
  for (const group of groups) {
    const head = group[0]!;
    if (isPostgraduateStudyStageLevel(head.stage_level)) examsPostgraduate += 1;
    else examsUndergraduate += 1;
    subjectKeys.add(`${head.college_subject_id}\0${head.study_subject_id}\0${head.stage_level}`);
  }
  let totalCapacity = 0;
  let totalCapacityMorning = 0;
  let totalCapacityEvening = 0;
  let totalAttendance = 0;
  let totalAttendanceMorning = 0;
  let totalAttendanceEvening = 0;
  let totalAbsence = 0;
  let totalAbsenceMorning = 0;
  let totalAbsenceEvening = 0;
  const supervisors = new Set<string>();
  const invigilators = new Set<string>();
  for (const d of details) {
    totalCapacity += d.capacity_total;
    totalCapacityMorning += d.capacity_morning;
    totalCapacityEvening += d.capacity_evening;
    totalAttendance += d.attendance_count;
    totalAttendanceMorning += d.attendance_morning;
    totalAttendanceEvening += d.attendance_evening;
    totalAbsence += d.absence_count;
    totalAbsenceMorning += d.absence_morning;
    totalAbsenceEvening += d.absence_evening;
    const sup = d.supervisor_name?.trim();
    if (sup) supervisors.add(sup);
    for (const name of splitLines(d.invigilators)) {
      invigilators.add(name);
    }
    for (const ex of d.room_external_staff.external_invigilators) {
      const n = ex.name.trim();
      if (n.length >= 2) invigilators.add(n);
    }
  }
  return {
    examsUndergraduate,
    examsPostgraduate,
    distinctExamSubjects: subjectKeys.size,
    totalRooms: details.length,
    totalCapacity,
    totalCapacityMorning,
    totalCapacityEvening,
    totalAttendance,
    totalAttendanceMorning,
    totalAttendanceEvening,
    totalAbsence,
    totalAbsenceMorning,
    totalAbsenceEvening,
    supervisorsDistinct: supervisors.size,
    invigilatorsDistinct: invigilators.size,
  };
}

function buildOfficialDailyTotalsTableHtml(
  t: DailyOfficialTotals,
  z: typeof escapeHtml,
  materialsColumnHeader = "عدد المواد الامتحانية لهذا اليوم أو الوجبة"
): string {
  const h = (label: string) => `<th scope="col" class="totals-h">${z(label)}</th>`;
  const h2 = (line1: string, line2: string) =>
    `<th scope="col" class="totals-h">${z(line1)}<br/>${z(line2)}</th>`;
  const c = (n: number) => `<td class="tabular totals-v">${n}</td>`;
  return `<section class="official-totals-wrap" aria-label="إجماليات التقرير">
  <h2 class="official-totals-title">الإجماليات — الأعداد الكلية</h2>
  <table class="table-official-summary">
    <thead>
      <tr>
        ${h("عدد الامتحانات الدراسة الأولية")}
        ${h("عدد الامتحانات الدراسات العليا")}
        ${h(materialsColumnHeader)}
        ${h("عدد القاعات الامتحانية الإجمالي")}
        ${h2("عدد الطلبة الكلي", "(جميع المقاعد)")}
        ${h2("إجمالي المقاعد", "الصباحي")}
        ${h2("إجمالي المقاعد", "المسائي")}
        ${h("عدد الحضور الكلي")}
        ${h2("إجمالي الحضور", "الصباحي")}
        ${h2("إجمالي الحضور", "المسائي")}
        ${h("عدد الغياب الكلي")}
        ${h2("إجمالي الغياب", "الصباحي")}
        ${h2("إجمالي الغياب", "المسائي")}
        ${h("عدد المشرفين الكلي")}
        ${h("عدد المراقبين الكلي")}
      </tr>
    </thead>
    <tbody>
      <tr>
        ${c(t.examsUndergraduate)}
        ${c(t.examsPostgraduate)}
        ${c(t.distinctExamSubjects)}
        ${c(t.totalRooms)}
        ${c(t.totalCapacity)}
        ${c(t.totalCapacityMorning)}
        ${c(t.totalCapacityEvening)}
        ${c(t.totalAttendance)}
        ${c(t.totalAttendanceMorning)}
        ${c(t.totalAttendanceEvening)}
        ${c(t.totalAbsence)}
        ${c(t.totalAbsenceMorning)}
        ${c(t.totalAbsenceEvening)}
        ${c(t.supervisorsDistinct)}
        ${c(t.invigilatorsDistinct)}
      </tr>
    </tbody>
  </table>
</section>`;
}

/**
 * القيم المخزّنة في الجداول غالباً «الأول» / «الثاني» (قيمة الحقل في بوابة الكلية).
 * في التقرير الرسمي يُفضَّل عرض الصيغة الكاملة.
 */
function formatTermLabelForOfficialReportHeader(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t === "الأول") return "الفصل الدراسي الأول";
  if (t === "الثاني") return "الفصل الدراسي الثاني";
  return t;
}

/** سطر الهيدر: أنظمة الدراسة المميّزة في بيانات التقرير */
function formatStudyTypesHeaderLineHtml(details: ExamSituationDetail[], z: typeof escapeHtml): string {
  const seen = new Set<string>();
  for (const d of details) {
    seen.add(STUDY_TYPE_AR[d.study_type] ?? d.study_type);
  }
  const arr = [...seen].sort((a, b) => a.localeCompare(b, "ar"));
  const text =
    arr.length > 0
      ? arr.map((x) => z(x)).join(` <span class="muted"> · </span> `)
      : z("—");
  return `<div><strong>نظام الدراسة:</strong> ${text}</div>`;
}

/** قيم فقط تحت عنوان التقرير: نوع الامتحان (نهائي/فصلي) + الفصل أو الدور / العام الدراسي */
function formatReportHeaderMetaValuesOnlyHtml(details: ExamSituationDetail[], z: typeof escapeHtml): string {
  const kindsSeen = new Set<string>();
  for (const d of details) {
    kindsSeen.add(scheduleExamKindShortAr(d.schedule_type));
  }
  const kindsArr = [...kindsSeen].sort((a, b) => a.localeCompare(b, "ar"));
  const examKindsHtml =
    kindsArr.length > 0
      ? kindsArr.map((k) => z(k)).join(` <span class="muted"> · </span> `)
      : z("—");

  const seenTy = new Set<string>();
  const termYearParts: string[] = [];
  for (const d of details) {
    const tRaw = (d.term_label ?? "").trim();
    const y = (d.academic_year ?? "").trim();
    const key = `${tRaw}\0${y}`;
    if (seenTy.has(key)) continue;
    seenTy.add(key);
    if (!tRaw && !y) continue;
    const termShown = tRaw ? formatTermLabelForOfficialReportHeader(tRaw) : "";
    termYearParts.push([termShown || null, y || null].filter(Boolean).join(" — "));
  }
  const termYearHtml =
    termYearParts.length > 0
      ? termYearParts.map((p) => z(p)).join(` <span class="muted"> · </span> `)
      : z("—");

  return `<p class="official-term-year official-term-year--values-only">
    <span class="official-term-year-value">${examKindsHtml}</span>
    <span class="muted" aria-hidden="true"> · </span>
    <span class="official-term-year-value">${termYearHtml}</span>
  </p>`;
}

function studyLevelTierCell(d: ExamSituationDetail, z: typeof escapeHtml): string {
  const tier = formatCollegeStudyLevelTierLabel(d.stage_level);
  return z(tier);
}

function shiftModeLabel(d: ExamSituationDetail): string {
  return describeCapacityByShiftAr(d.capacity_morning, d.capacity_evening, d.capacity_total).modeLabelAr;
}

function absenceNamesOfficialCell(d: ExamSituationDetail, z: typeof escapeHtml): string {
  const capM = d.capacity_morning;
  const capE = d.capacity_evening;
  if (capM > 0 || capE > 0) {
    const chunks: string[] = [];
    if (capM > 0) {
      const n = (d.absence_names_morning ?? "").trim();
      chunks.push(`<strong>صباحي:</strong> ${z(n) || "—"}`);
    }
    if (capE > 0) {
      const n = (d.absence_names_evening ?? "").trim();
      chunks.push(`<strong>مسائي:</strong> ${z(n) || "—"}`);
    }
    return `${chunks.join("<br/>")}<div class="muted" style="font-size:11px;margin-top:4px">يُذكر السبب في النص إن وُجد عند الإدخال</div>`;
  }
  const n = (d.absence_names ?? "").trim();
  return n
    ? `${z(n)}<div class="muted" style="font-size:11px;margin-top:4px">يُذكر السبب في النص إن وُجد عند الإدخال</div>`
    : "—";
}

/** أوقات ومدد متميزة من جلسات التقرير — تُعرض في عمود التاريخ/الوقت بالهيدر */
function formatDistinctExamTimesHeaderHtml(details: ExamSituationDetail[], z: typeof escapeHtml): string {
  const map = new Map<string, { start: string; end: string; dur: number }>();
  for (const d of details) {
    const k = `${d.start_time}\0${d.end_time}\0${d.duration_minutes}`;
    if (!map.has(k)) map.set(k, { start: d.start_time, end: d.end_time, dur: d.duration_minutes });
  }
  const items = [...map.values()].sort((a, b) => {
    if (a.start !== b.start) return a.start.localeCompare(b.start);
    if (a.end !== b.end) return a.end.localeCompare(b.end);
    return a.dur - b.dur;
  });
  if (items.length === 0) {
    return `<div style="margin-top:4px"><strong>وقت الامتحان والمدة:</strong> ${z("—")}</div>`;
  }
  const parts = items.map((it) => {
    const tStart = formatExamClock12hAr(it.start);
    const tEnd = formatExamClock12hAr(it.end);
    const dur = formatDurationAr(it.dur);
    return `${z(tStart)} — ${z(tEnd)} <span class="muted">(${z(dur)})</span>`;
  });
  return `<div style="margin-top:4px"><strong>وقت الامتحان والمدة:</strong> ${parts.join(` <span class="muted">·</span> `)}</div>`;
}

function buildWorkflowAndApprovalSectionHtml(
  z: typeof escapeHtml,
  opts?: { fullDayBothMeals?: boolean }
): string {
  return `<section class="post-table-block" dir="rtl">
  <h2 class="post-table-title">حالة الجدول والاعتماد</h2>
  ${buildDeanSignatureBlockHtml(z, opts)}
</section>`;
}

function buildDeanSignatureBlockHtml(
  z: typeof escapeHtml,
  opts?: { fullDayBothMeals?: boolean }
): string {
  if (opts?.fullDayBothMeals) {
    return `<div class="sign-stamp-block">
  <div class="sign-row">
    <span class="sign-label">${z("توقيع وختم عميد الكلية / المعاون العلمي")}</span>
    <span class="sign-line-area" aria-hidden="true"></span>
  </div>
</div>`;
  }
  return `<div class="sign-stamp-block">
  <div class="sign-row">
    <span class="sign-label">${z("توقيع عميد الكلية / المعاون العلمي")}</span>
    <span class="sign-line-area" aria-hidden="true"></span>
  </div>
  <div class="stamp-row">
    <span class="sign-label">${z("الختم")}</span>
    <span class="stamp-box" aria-hidden="true"></span>
  </div>
</div>`;
}

function officialDailyDataRow(
  d: ExamSituationDetail,
  z: typeof escapeHtml,
  roomPos: number,
  roomTotal: number
): string {
  const roomCol =
    roomTotal > 1
      ? `${z(d.room_name)}<br/><span class="muted" style="font-size:11px">قاعة ${roomPos} من ${roomTotal}</span>`
      : z(d.room_name);
  return `<tr>
  <td>${z(formatCollegeStudyStageLabel(d.stage_level))}</td>
  <td>${studyLevelTierCell(d, z)}</td>
  <td>${z(d.branch_name)}</td>
  <td><strong>${z(d.subject_name)}</strong></td>
  <td>${z(d.instructor_name)}</td>
  <td>${z(shiftModeLabel(d))}</td>
  <td>${roomCol}</td>
  <td class="tabular">${d.capacity_total}</td>
  <td class="tabular">${d.attendance_count}</td>
  <td class="tabular">${d.absence_count}</td>
  <td style="font-size:12px;line-height:1.45">${absenceNamesOfficialCell(d, z)}</td>
  <td>${formatSupervisorForSituationReport(d.supervisor_name ?? "", d.room_external_staff, z)}</td>
  <td style="font-size:12px">${formatInvigilatorsForSituationReport(d.invigilators, d.room_external_staff, z, splitLines)}</td>
  <td style="font-size:11px;line-height:1.45;text-align:right">${situationStaffAbsencesReportBlockHtml(d, z)}</td>
  <td style="font-size:11px;line-height:1.45;text-align:right">${situationCheatingReportBlockHtml(d, z)}</td>
</tr>`;
}

export type DailyOfficialReportOptions = {
  /** شعار الجامعة كـ data URI لضمان الظهور عند الطباعة من نافذة منبثقة */
  logoDataUri?: string | null;
  /** يُعرض في الترويسة — الافتراضي جامعة البصرة */
  universityNameAr?: string;
  /**
   * تقرير واحد يجمع الوجبة الأولى والثانية لنفس اليوم (نفس هيكل التقرير لكل وجبة، مع عنوان يصف اليوم الكامل).
   */
  fullDayBothMeals?: boolean;
};

/**
 * قالب HTML واحد للتقرير النهائي اليومي: الوجبة الأولى، الثانية، أو اليوم الكامل (`fullDayBothMeals`).
 * تنسيق الجدول الرسمي موحّد لجميع الحالات.
 */
export function buildDailyExamSituationsFinalReportHtml(
  details: ExamSituationDetail[],
  examDate: string,
  collegeLabel: string,
  deanName: string,
  generatedLabel: string,
  /** عند تحديدها يُذكر عنوان التقرير والوجبة صراحةً (تقرير لكل وجبة على حدة). يُتجاهل إن وُجد `fullDayBothMeals`. */
  mealSlot?: 1 | 2,
  options?: DailyOfficialReportOptions
): string {
  const z = escapeHtml;
  const fullDayBoth = options?.fullDayBothMeals === true;
  const dateLine = formatExamDateLongAr(examDate);
  const mealLine =
    fullDayBoth
      ? null
      : mealSlot === 1 || mealSlot === 2
        ? formatExamMealSlotLabel(mealSlot)
        : null;
  const titlePlain = fullDayBoth
    ? "التقرير النهائي الشامل — الوجبة الأولى والوجبة الثانية — المواقف الامتحانية"
    : mealLine != null
      ? `التقرير النهائي — ${mealLine} — المواقف الامتحانية`
      : "التقرير النهائي — المواقف الامتحانية لليوم";
  const titleHtml = fullDayBoth
    ? "التقرير النهائي الشامل — الوجبة الأولى والوجبة الثانية — المواقف الامتحانية"
    : mealLine != null
      ? `التقرير النهائي — ${z(mealLine)} — المواقف الامتحانية`
      : z(titlePlain);
  const uni = (options?.universityNameAr ?? "جامعة البصرة").trim() || "جامعة البصرة";
  const logoUri = options?.logoDataUri?.trim() ?? "";
  const logoBlock = logoUri
    ? `<div class="logo-wrap"><img src="${logoUri}" alt="${z("شعار " + uni)}" class="logo-img" /></div>`
    : `<div class="logo-wrap logo-missing muted" style="font-size:13px">شعار الجامعة (uob-logo.png)</div>`;

  const groups = groupExamSituationDetailsForDailyReport(details);
  const dailyTotals = computeDailyOfficialReportTotals(details, groups);
  const materialsTotalsHeader = fullDayBoth
    ? "عدد المواد الامتحانية (الوجبتان — اليوم الكامل)"
    : "عدد المواد الامتحانية لهذا اليوم أو الوجبة";
  const totalsTableHtml = buildOfficialDailyTotalsTableHtml(dailyTotals, z, materialsTotalsHeader);
  const rowChunks: string[] = [];
  if (details.length === 0) {
    rowChunks.push(
      `<tr><td colspan="${OFFICIAL_DAILY_COLS}" class="muted">لا توجد جلسات مرفوعة لهذا التقرير.</td></tr>`
    );
  } else {
    for (const group of groups) {
      const n = group.length;
      if (n === 1) {
        rowChunks.push(officialDailyDataRow(group[0]!, z, 1, 1));
        continue;
      }
      let cap = 0;
      let att = 0;
      let abs = 0;
      const nameChunks: string[] = [];
      for (let i = 0; i < group.length; i++) {
        const d = group[i]!;
        cap += d.capacity_total;
        att += d.attendance_count;
        abs += d.absence_count;
        const merged = mergeAbsenceNamesByShift(d.absence_names_morning, d.absence_names_evening);
        const src = merged.trim() || (d.absence_names ?? "").trim();
        if (src) nameChunks.push(src);
        rowChunks.push(officialDailyDataRow(d, z, i + 1, n));
      }
      const absenceSorted = sortUniqueAbsenceNamesLocal(nameChunks.join("\n"));
      const head = group[0]!;
      rowChunks.push(`<tr class="subtotal-row">
  <td colspan="${OFFICIAL_DAILY_COLS_BEFORE_COUNTS}"><strong>إجمالي جلسة واحدة موزّعة على ${n} قاعة امتحانية</strong><br/><span class="muted" style="font-size:12px;font-weight:600">${z(head.subject_name)} — ${z(head.branch_name)} — ${z(formatCollegeStudyStageLabel(head.stage_level))}</span></td>
  <td class="tabular"><strong>${cap}</strong></td>
  <td class="tabular"><strong>${att}</strong></td>
  <td class="tabular"><strong>${abs}</strong></td>
  <td colspan="${OFFICIAL_DAILY_SUBTOTAL_TAIL_COLSPAN}" style="font-size:12px;line-height:1.45"><strong>أسماء الغياب مفرّزة من كل القاعات:</strong><br/>${z(absenceSorted) || "—"}</td>
</tr>`);
    }
  }
  const rows = rowChunks.join("\n");
  const headerMetaValuesHtml = formatReportHeaderMetaValuesOnlyHtml(details, z);
  const studyTypesHeaderLineHtml = formatStudyTypesHeaderLineHtml(details, z);
  const examTimesHeaderHtml = formatDistinctExamTimesHeaderHtml(details, z);
  const workflowSectionHtml = buildWorkflowAndApprovalSectionHtml(z, { fullDayBothMeals: fullDayBoth });
  const titleTag = fullDayBoth
    ? `تقرير شامل — الوجبتان — ${examDate}`
    : mealLine != null
      ? `تقرير نهائي — ${mealLine} — ${examDate}`
      : `تقرير نهائي — ${examDate}`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${z(titleTag)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Tajawal", "Segoe UI", Tahoma, Arial, sans-serif; margin: 0; padding: 14px 16px 20px; color: #111827; font-size: 13px; line-height: 1.45; background: #fff; }
    @page { size: A4 landscape; margin: 10mm; }
    @media print {
      body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .table-official thead tr > th,
      .table-official tbody tr > td {
        vertical-align: middle !important;
        text-align: center !important;
      }
      .table-official-summary thead tr > th,
      .table-official-summary tbody tr > td {
        vertical-align: middle !important;
        text-align: center !important;
      }
    }
    .official-top { border-bottom: 3px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 12px; }
    .hdr-main-row { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
    .hdr-institution { flex: 1 1 200px; min-width: 180px; text-align: right; font-size: 14px; line-height: 1.55; color: #1f2937; }
    .hdr-center { flex: 0 1 auto; text-align: center; max-width: min(440px, 100%); }
    .hdr-center .logo-wrap { margin: 0 0 8px; text-align: center; }
    .logo-img { max-height: 72px; max-width: 200px; height: auto; width: auto; object-fit: contain; display: inline-block; vertical-align: middle; }
    .official-title { margin: 0; font-size: 19px; font-weight: 800; color: #1e3a8a; text-align: center; line-height: 1.35; }
    .official-term-year { margin: 8px 0 0; text-align: center; font-size: 13px; line-height: 1.45; color: #1f2937; }
    .official-term-year-value { font-weight: 600; }
    .official-term-year--values-only { font-weight: 600; }
    .hdr-datetime { flex: 1 1 200px; min-width: 180px; text-align: left; font-size: 14px; line-height: 1.55; color: #1f2937; direction: ltr; }
    .hdr-datetime-inner { display: inline-block; direction: rtl; text-align: right; }
    .official-totals-wrap { margin-top: 12px; margin-bottom: 14px; }
    .official-totals-title { margin: 0 0 8px; font-size: 15px; font-weight: 800; color: #1e3a8a; text-align: right; }
    .table-official-summary { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; }
    .table-official-summary .totals-h, .table-official-summary .totals-v { border: 1px solid #9ca3af; padding: 5px 3px; vertical-align: middle; }
    .table-official-summary thead .totals-h { background: #f3f4f6; font-weight: 800; color: #111827; text-align: center; line-height: 1.25; word-wrap: break-word; }
    .table-official-summary tbody .totals-v { text-align: center; font-variant-numeric: tabular-nums; font-weight: 800; font-size: 11px; }
    .table-official { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; table-layout: fixed; }
    /* نفس الجدول لكل من: الوجبة الأولى، الوجبة الثانية، والتقرير الشامل (fullDayBothMeals) */
    .table-official thead tr > th,
    .table-official tbody tr > td {
      border: 1px solid #9ca3af;
      padding: 5px 4px;
      vertical-align: middle;
      text-align: center;
      word-wrap: break-word;
    }
    .table-official th { background: #e5e7eb; font-weight: 800; color: #111827; font-size: 10px; line-height: 1.25; }
    .table-official .tabular { text-align: center; font-variant-numeric: tabular-nums; }
    .table-official ul.list-dot { width: fit-content; max-width: 100%; margin: 0 auto; padding-inline-start: 1.15em; text-align: start; }
    .subtotal-row td { background: #eff6ff; font-weight: 600; vertical-align: middle; text-align: center; }
    .muted { color: #6b7280; }
    .list-dot li { margin: 2px 0; }
    .post-table-block { margin-top: 18px; padding-top: 14px; border-top: 2px solid #1e3a8a; }
    .post-table-title { margin: 0 0 14px; font-size: 16px; font-weight: 800; color: #1e3a8a; text-align: right; }
    /* يسار الصفحة فعلياً: هامش أيمن تلقائي داخل مقطع rtl */
    .sign-stamp-block { margin-top: 4px; max-width: 520px; margin-left: 0; margin-right: auto; }
    .sign-row, .stamp-row { display: flex; align-items: flex-end; gap: 10px; margin-bottom: 22px; flex-wrap: wrap; }
    .sign-label { font-weight: 700; color: #111827; white-space: nowrap; font-size: 13px; }
    .sign-line-area { flex: 1; min-width: 180px; border-bottom: 1px solid #111827; height: 28px; min-height: 28px; }
    .stamp-box { width: 100px; height: 100px; border: 2px dashed #6b7280; border-radius: 4px; flex-shrink: 0; }
    .footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 11px; color: #4b5563; text-align: center; }
  </style>
</head>
<body>
  <header class="official-top">
    <div class="hdr-main-row">
      <div class="hdr-institution">
        <div><strong>${z(uni)}</strong></div>
        <div><strong>الكلية / التشكيل:</strong> ${z(collegeLabel)}</div>
        <div><strong>عميد الكلية (المسجّل):</strong> ${z(deanName.trim() || "—")}</div>
        ${fullDayBoth ? `<div><strong>نطاق التقرير:</strong> الوجبة الأولى والوجبة الثانية — اليوم الامتحاني كامل</div>` : mealLine != null ? `<div><strong>الوجبة:</strong> ${z(mealLine)}</div>` : ""}
        ${studyTypesHeaderLineHtml}
      </div>
      <div class="hdr-center">
        ${logoBlock}
        <h1 class="official-title">${titleHtml}</h1>
        ${headerMetaValuesHtml}
      </div>
      <div class="hdr-datetime">
        <div class="hdr-datetime-inner">
          <div><strong>تاريخ الامتحان:</strong> ${z(dateLine)}</div>
          <div><strong>اليوم (تقويم):</strong> ${z(examDate)}</div>
          <div><strong>وقت إصدار التقرير:</strong> ${z(generatedLabel)}</div>
          <div class="muted" style="margin-top:4px">عدد سجلات القاعات في التقرير: ${details.length}</div>
          ${examTimesHeaderHtml}
        </div>
      </div>
    </div>
  </header>
  ${totalsTableHtml}
  <table class="table-official">
    <thead>
      <tr>
        <th>المرحلة<br/>الدراسية</th>
        <th>المستوى الدراسي<br/>(أولية / عليا)</th>
        <th>القسم</th>
        <th>المادة<br/>الدراسية</th>
        <th>اسم<br/>التدريسي</th>
        <th>نوع الدوام<br/>بالقاعة</th>
        <th>القاعة<br/>الامتحانية</th>
        <th>المقاعد<br/>الكلية</th>
        <th>الحضور</th>
        <th>الغياب</th>
        <th>الطالب الغائب<br/>(والسبب إن وُجد)</th>
        <th>مشرف<br/>القاعة</th>
        <th>المراقبون</th>
        <th>غياب المشرف أو المراقب<br/><span style="font-weight:600">(السبب والبديل)</span></th>
        <th>حالات الغش<br/><span style="font-weight:600">(الطالب والملاحظات)</span></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  ${workflowSectionHtml}
  <footer class="footer">نظام رصين لإدارة الامتحانات — جامعة البصرة — للحفظ PDF استخدم الطباعة ثم «حفظ كـ PDF».</footer>
</body>
</html>`;
}
