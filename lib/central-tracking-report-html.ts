import type { CentralTrackingExamRow } from "@/lib/college-exam-situations";
import { formatExamMealSlotLabel } from "@/lib/exam-meal-slot";
import {
  EXAM_SITUATION_TZ,
  calendarDateInTimeZone,
  minutesSinceMidnightInTimeZone,
  parseTimeToMinutes,
} from "@/lib/exam-situation-window";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function examEnded(row: CentralTrackingExamRow, now: Date): boolean {
  const today = calendarDateInTimeZone(now, EXAM_SITUATION_TZ);
  if (row.examDate < today) return true;
  if (row.examDate > today) return false;
  const endM = parseTimeToMinutes(row.endTime);
  if (endM < 0) return false;
  return minutesSinceMidnightInTimeZone(now, EXAM_SITUATION_TZ) > endM;
}

function trackingStatusLabelAr(r: CentralTrackingExamRow, now: Date): string {
  if (r.reportStatus === "SUBMITTED") return "تم الرفع والاعتماد المبدئي";
  if (r.reportStatus === "NOT_SUBMITTED" && examEnded(r, now)) return "متأخر — الموقف غير مُرفوع بعد انتهاء الجلسة";
  if (r.reportStatus === "NOT_SUBMITTED") return "الموقف غير مُرفوع";
  return "مُرفوع — بانتظار اعتماد عميد الكلية";
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

function examTypeLabelAr(t: CentralTrackingExamRow["examType"]): string {
  return t === "SEMESTER" ? "فصلي" : "نهائي";
}

export type CentralTrackingReportPrintInput = {
  /** تاريخ الجلسات المعروضة YYYY-MM-DD */
  examDateIso: string;
  /** وصف معايير التصفية الحالية */
  filterScopeAr: string;
  /** الصفوف المراد إدراجها (مُصفّاة ومرتبة كما في الشاشة) */
  rows: CentralTrackingExamRow[];
  /** وقت إصدار التقرير (نص عربي توقيت بغداد) */
  generatedLabelAr: string;
  /** جهة الإصدار في النظام */
  issuedByLineAr?: string;
  /** ملخص الحالة التشغيلية لليوم */
  operationalSummaryAr: string;
  kpis: {
    colleges: number;
    exams: number;
    students: number;
    absences: number;
    submitted: number;
    lateMissing: number;
  };
  /** أصل الموقع لتحميل الشعار (مثلاً https://example.com) */
  assetsBaseUrl: string;
};

/**
 * تقرير HTML رسمي — المتابعة المركزية للامتحانات.
 * مُحسَّن للطباعة أو «حفظ كـ PDF» من نافذة المتصفح، ورق A4 أفقي.
 */
export function buildCentralTrackingReportPrintHtml(
  input: CentralTrackingReportPrintInput,
  referenceTime: Date
): string {
  const e = escapeHtml;
  const base = (input.assetsBaseUrl ?? "").replace(/\/$/, "");
  const logoSrc = base ? `${base}/uob-logo.png` : "/uob-logo.png";

  const dateTitle = examDateLongAr(input.examDateIso);
  const k = input.kpis;

  const tableBody =
    input.rows.length === 0
      ? `<tr><td colspan="14" class="muted">لا توجد جلسات ضمن نطاق التقرير الحالي.</td></tr>`
      : input.rows
          .map((r, i) => {
            const timeR = `${e(r.startTime)} — ${e(r.endTime)}`;
            const att =
              typeof r.attendanceCount === "number" && !Number.isNaN(r.attendanceCount) ? r.attendanceCount : "—";
            return `<tr>
            <td class="num">${i + 1}</td>
            <td class="college">${e(r.collegeName)}</td>
            <td>${e(r.department)}</td>
            <td class="subj">${e(r.subject)}</td>
            <td class="num">${e(r.studyStageLabel)}</td>
            <td class="num nowrap">${timeR}</td>
            <td class="compact nowrap">${e(formatExamMealSlotLabel(r.mealSlot))}</td>
            <td class="compact">${e(examTypeLabelAr(r.examType))}</td>
            <td class="num">${r.studentsCount}</td>
            <td class="num pres">${typeof att === "number" ? att : att}</td>
            <td class="num abs">${r.absencesCount}</td>
            <td class="num">${r.roomsCount}</td>
            <td class="room">${e(r.roomName)}</td>
            <td class="status">${e(trackingStatusLabelAr(r, referenceTime))}</td>
          </tr>`;
          })
          .join("");

  const issued = input.issuedByLineAr?.trim() ? `<br />جهة الاطلاع: ${e(input.issuedByLineAr.trim())}` : "";

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير المتابعة المركزية — ${e(dateTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: 'Segoe UI', 'Noto Naskh Arabic', Tahoma, Arial, sans-serif;
      margin: 0;
      padding: 8mm 10mm 10mm;
      color: #0f172a;
      font-size: 10pt;
      line-height: 1.45;
    }
    @page {
      size: A4 landscape;
      margin: 8mm;
    }
    .report-brand {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 10px;
      margin: 0 0 3mm;
      padding-bottom: 3mm;
      border-bottom: 2px solid #1e3a8a;
    }
    .report-brand-side { font-size: 11pt; font-weight: 800; color: #1e3a8a; }
    .report-brand-college-side { text-align: left; }
    .report-brand-uni-side { text-align: right; }
    .report-brand-logo { height: 52px; width: auto; max-width: 90px; object-fit: contain; }
    h1 {
      font-size: 14pt;
      text-align: center;
      margin: 0 0 1mm;
      color: #1e3a8a;
      font-weight: 800;
      padding-bottom: 2mm;
      border-bottom: 1px solid #cbd5e1;
    }
    .sub {
      text-align: center;
      font-size: 9.8pt;
      color: #475569;
      margin: 2mm 0 3mm;
      line-height: 1.55;
    }
    .scope { display: block; margin-top: 1.5mm; font-weight: 700; color: #334155; text-align: right; }
    .mono { font-family: Consolas, ui-monospace, monospace; font-size: 9.2pt; }
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
      margin: 0 0 4mm;
      font-size: 8.6pt;
    }
    .kpi {
      border: 1px solid #94a3b8;
      border-radius: 4px;
      padding: 6px 8px;
      background: #f8fafc;
      text-align: center;
    }
    .kpi strong { display: block; font-size: 11pt; color: #1e3a8a; font-variant-numeric: tabular-nums; }
    .kpi span { color: #64748b; font-size: 8.2pt; }
    table.data {
      width: 100%;
      border-collapse: collapse;
      margin: 1mm 0;
      font-size: 7.6pt;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #94a3b8;
      padding: 2px 4px;
      text-align: right;
      vertical-align: top;
      word-wrap: break-word;
    }
    th {
      background: #e2e8f0;
      font-weight: 800;
      color: #1e293b;
      font-size: 7.4pt;
    }
    td.num { text-align: center; font-variant-numeric: tabular-nums; }
    td.compact { font-size: 7.2pt; white-space: nowrap; }
    td.nowrap { white-space: nowrap; }
    td.subj { font-weight: 700; font-size: 7.5pt; }
    td.college { font-weight: 700; color: #1e3a5f; font-size: 7.5pt; }
    td.room { font-size: 7.2pt; }
    td.pres { color: #065f46; font-weight: 700; }
    td.abs { color: #92400e; font-weight: 700; }
    td.status { font-size: 7.2pt; line-height: 1.35; color: #334155; }
    .muted { color: #64748b; text-align: center; padding: 8mm; }
    .ops {
      margin: 0 0 3mm;
      padding: 8px 10px;
      border-right: 4px solid #2563eb;
      background: #f1f5f9;
      font-size: 9.2pt;
      font-weight: 700;
      color: #1e3a8a;
    }
    .footer {
      margin-top: 4mm;
      padding-top: 2mm;
      border-top: 1px solid #cbd5e1;
      font-size: 8.8pt;
      color: #64748b;
      text-align: center;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    @media print {
      .kpi-row { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="report-brand" dir="ltr">
    <div class="report-brand-side report-brand-college-side">المتابعة المركزية للامتحانات</div>
    <div style="text-align:center"><img class="report-brand-logo" src="${e(logoSrc)}" alt="" /></div>
    <div class="report-brand-side report-brand-uni-side">جامعة البصرة</div>
  </div>
  <h1>تقرير المتابعة المركزية لمواقف الامتحانات</h1>
  <p class="sub">
    تاريخ الجلسات المعروضة: <strong>${e(dateTitle)}</strong>
    <span class="scope">نطاق البيانات: ${e(input.filterScopeAr)}</span>
    <br />
    ملخص الحالة: ${e(input.operationalSummaryAr)}
    <br />
    صدور التقرير: <span class="mono">${e(input.generatedLabelAr)}</span>${issued}
  </p>
  <div class="kpi-row">
    <div class="kpi"><strong>${k.colleges}</strong><span>كلية (ضمن التصفية)</span></div>
    <div class="kpi"><strong>${k.exams}</strong><span>جلسة امتحانية</span></div>
    <div class="kpi"><strong>${k.students}</strong><span>طلبة (إجمالي المقاعد المعتمدة)</span></div>
    <div class="kpi"><strong>${k.absences}</strong><span>غياب مسجل</span></div>
    <div class="kpi"><strong>${k.submitted}</strong><span>جلسات بموقف مكتمل فعلياً</span></div>
    <div class="kpi"><strong>${k.lateMissing}</strong><span>جلسات بلا موقف مرفوع</span></div>
  </div>
  <p class="ops">البيانات مستقاة من الجداول المعتمدة ومواقف الكليات في النظام الموحّد — يُعتمد هذا التقرير لأغراض المتابعة الإدارية والفنية.</p>
  <table class="data">
    <thead>
      <tr>
        <th style="width:2.2%">#</th>
        <th style="width:9%">الكلية</th>
        <th style="width:8%">القسم / الفرع</th>
        <th style="width:11%">المادة</th>
        <th style="width:4.5%">المرحلة</th>
        <th style="width:6.5%">وقت الجلسة</th>
        <th style="width:4.5%">الوجبة</th>
        <th style="width:4%">النوع</th>
        <th style="width:4%">الطلبة</th>
        <th style="width:4%">الحضور</th>
        <th style="width:4%">الغياب</th>
        <th style="width:3.5%">القاعات</th>
        <th style="width:9%">القاعة (الرئيسية)</th>
        <th style="width:16%">حالة رفع الموقف</th>
      </tr>
    </thead>
    <tbody>${tableBody}</tbody>
  </table>
  <div class="footer">
    ورق A4 — وضع أفقي (عرضي). لحفظ الملف PDF: من نافذة الطباعة اختر «حفظ كـ PDF» أو «Microsoft Print to PDF».
  </div>
</body>
</html>`;
}

/** فتح نافذة طباعة / حفظ PDF */
export function printCentralTrackingReportHtml(html: string): boolean {
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
      window.setTimeout(runPrint, 200);
    } else {
      w.addEventListener("load", () => window.setTimeout(runPrint, 200), { once: true });
    }
  } catch {
    try {
      w.close();
    } catch {
      /* ignore */
    }
    return false;
  }
  return true;
}
