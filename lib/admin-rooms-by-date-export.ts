import type { AdminCollegeExamRoomDayParticipationRow } from "@/lib/college-rooms";
import { formatExamMealSlotLabel } from "@/lib/exam-meal-slot";
import { formatExamClock12hAr } from "@/lib/exam-situation-window";
import { formatCollegeStudyStageLabel } from "@/lib/college-study-stage-display";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shiftCapacityLabel(row: AdminCollegeExamRoomDayParticipationRow, slot: 1 | 2): string {
  if (slot === 1) {
    return `${row.capacity_total} (ص ${row.capacity_morning} + م ${row.capacity_evening})`;
  }
  if (!row.study_subject_id_2) return "—";
  return `${row.capacity_total_2} (ص ${row.capacity_morning_2} + م ${row.capacity_evening_2})`;
}

function scheduleTypeLabelAr(t: "FINAL" | "SEMESTER"): string {
  return t === "SEMESTER" ? "فصلي" : "نهائي";
}

function examTimeRangeAr(start: string, end: string): string {
  return `${formatExamClock12hAr(start)} – ${formatExamClock12hAr(end)}`;
}

function sortRows(rows: AdminCollegeExamRoomDayParticipationRow[]): AdminCollegeExamRoomDayParticipationRow[] {
  return [...rows].sort((a, b) => {
    const fa = a.formation_label.localeCompare(b.formation_label, "ar");
    if (fa !== 0) return fa;
    const ua = a.owner_username.localeCompare(b.owner_username);
    if (ua !== 0) return ua;
    if (a.serial_no !== b.serial_no) return a.serial_no - b.serial_no;
    const ma = a.exam_meal_slot - b.exam_meal_slot;
    if (ma !== 0) return ma;
    return a.exam_start_time.localeCompare(b.exam_start_time);
  });
}

function weekdayAr(dateIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return "";
  return new Intl.DateTimeFormat("ar-IQ", { weekday: "long", timeZone: "Asia/Baghdad" }).format(
    new Date(`${dateIso}T12:00:00`)
  );
}

function formatDateAr(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  try {
    return new Intl.DateTimeFormat("ar-IQ", {
      timeZone: "Asia/Baghdad",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(`${iso}T12:00:00`));
  } catch {
    return iso;
  }
}

export type AdminRoomsByDateReportInput = {
  examDate: string;
  rows: AdminCollegeExamRoomDayParticipationRow[];
  generatedLabel: string;
  assetsBaseUrl: string;
};

export function buildAdminRoomsByDateReportHtml(input: AdminRoomsByDateReportInput): string {
  const e = escapeHtml;
  const { examDate, rows, generatedLabel, assetsBaseUrl } = input;
  const base = (assetsBaseUrl ?? "").replace(/\/$/, "");
  const logoSrc = base ? `${base}/uob-logo.png` : "/uob-logo.png";
  const sorted = sortRows(rows);
  const uniqueRooms = new Set(sorted.map((r) => `${r.owner_user_id}:${r.id}`));
  const formations = new Set(sorted.map((r) => r.owner_user_id));
  const dayLabel = formatDateAr(examDate);
  const weekday = weekdayAr(examDate);

  const tableRows = sorted
    .map((row, index) => {
      const dual = Boolean(row.study_subject_id_2);
      return `<tr>
        <td>${index + 1}</td>
        <td>${e(row.formation_label)}</td>
        <td class="mono">${e(row.owner_username)}</td>
        <td class="num">${row.serial_no}</td>
        <td><strong>${e(row.room_name)}</strong></td>
        <td>${e(row.supervisor_name)}</td>
        <td style="font-size:8.8pt">${e(row.exam_study_subject_name)} — ${e(formatCollegeStudyStageLabel(row.exam_stage_level))}</td>
        <td>${e(row.exam_college_subject_name)}</td>
        <td>${e(scheduleTypeLabelAr(row.exam_schedule_type))}</td>
        <td>${e(formatExamMealSlotLabel(row.exam_meal_slot))}</td>
        <td style="font-size:8.5pt;white-space:nowrap">${e(examTimeRangeAr(row.exam_start_time, row.exam_end_time))}</td>
        <td class="num">${row.exam_student_count}</td>
        <td style="font-size:8.5pt">${e(shiftCapacityLabel(row, 1))}${dual ? `<br/>${e(shiftCapacityLabel(row, 2))}` : ""}</td>
        <td style="font-size:8.5pt;max-width:36mm;word-break:break-word">${e((row.invigilators || "—").slice(0, 320))}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <title>قاعات يوم الامتحان — ${e(examDate)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Arial (Body CS)", Arial, Tahoma, sans-serif; margin: 0; padding: 10mm; color: #0f172a; font-size: 10pt; line-height: 1.45; }
    @page { size: A4 landscape; margin: 12mm; }
    .report-brand { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; margin: 0 0 5mm; padding-bottom: 4mm; border-bottom: 1px solid #e2e8f0; }
    .report-brand-side { font-size: 10.5pt; font-weight: 800; color: #1e3a8a; }
    .report-brand-college-side { text-align: left; }
    .report-brand-uni-side { text-align: right; }
    .report-brand-logo { height: 52px; width: auto; max-width: 96px; object-fit: contain; }
    h1 { font-size: 14pt; text-align: center; margin: 0 0 3mm; border-bottom: 2px solid #1e3a8a; padding-bottom: 3mm; color: #1e3a8a; }
    .sub { text-align: center; font-size: 9.5pt; color: #475569; margin-bottom: 1mm; }
    .mono { font-family: Consolas, ui-monospace, monospace; font-size: 9pt; }
    h2 { font-size: 11pt; color: #1e3a8a; margin: 4mm 0 2mm; border-right: 4px solid #2563eb; padding-right: 8px; }
    table.data { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 8.5pt; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 5px; text-align: right; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; color: #334155; }
    td.num { text-align: center; font-variant-numeric: tabular-nums; }
    .summary { display: table; width: 100%; border-collapse: collapse; margin-bottom: 4mm; font-size: 9.5pt; }
    .summary-row { display: table-row; }
    .summary-cell { display: table-cell; border: 1px solid #e2e8f0; padding: 7px 8px; text-align: center; background: #f8fafc; }
    .summary-val { font-size: 12pt; font-weight: 800; color: #1e3a8a; }
    .muted { color: #64748b; font-size: 9pt; }
    .footer { margin-top: 5mm; padding-top: 3mm; border-top: 1px solid #e2e8f0; font-size: 8.5pt; color: #64748b; text-align: center; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="report-brand" dir="ltr">
    <div class="report-brand-side report-brand-college-side">قاعات مشاركة بالامتحان</div>
    <div style="text-align:center"><img class="report-brand-logo" src="${e(logoSrc)}" width="96" height="96" alt="" /></div>
    <div class="report-brand-side report-brand-uni-side">جامعة البصرة</div>
  </div>
  <h1>تقرير تفاصيل القاعات — يوم الامتحان ${e(dayLabel)} (${e(weekday)})</h1>
  <p class="sub">نظام رصين لإدارة الامتحانات — التاريخ: <strong>${e(examDate)}</strong></p>
  <p class="sub muted">تاريخ ووقت إصدار التقرير: ${e(generatedLabel)}</p>
  <p class="sub muted" style="margin-bottom:4mm">يشمل كل قاعة لها جلسة امتحانية مجدولة في هذا اليوم عبر جميع التشكيلات.</p>

  <h2>ملخص</h2>
  <div class="summary">
    <div class="summary-row">
      <div class="summary-cell"><span class="muted">جلسات امتحانية (قاعة × مادة)</span><div class="summary-val">${sorted.length}</div></div>
      <div class="summary-cell"><span class="muted">قاعات مميزة</span><div class="summary-val">${uniqueRooms.size}</div></div>
      <div class="summary-cell"><span class="muted">تشكيلات / حسابات</span><div class="summary-val">${formations.size}</div></div>
    </div>
  </div>

  <h2>التفاصيل</h2>
  <table class="data">
    <thead>
      <tr>
        <th>#</th>
        <th>التشكيل</th>
        <th>الحساب</th>
        <th>تسلسل</th>
        <th>القاعة</th>
        <th>مشرف القاعة</th>
        <th>مادة الامتحان / المرحلة</th>
        <th>القسم/الفرع</th>
        <th>نوع الجدول</th>
        <th>الوجبة</th>
        <th>الوقت</th>
        <th>سعة الجلسة</th>
        <th>سعة القاعة</th>
        <th>المراقبون</th>
      </tr>
    </thead>
    <tbody>${sorted.length ? tableRows : `<tr><td colspan="14" style="text-align:center;padding:8mm;color:#64748b">لا توجد قاعات مشاركة في هذا اليوم.</td></tr>`}</tbody>
  </table>
  <div class="footer">تقرير صادر عن نظام رصين — قاعات شاركت بامتحان في التاريخ المحدد.</div>
</body>
</html>`;
}

export function adminRoomsByDateRowsToExcelRecords(
  rows: AdminCollegeExamRoomDayParticipationRow[]
): Record<string, string | number>[] {
  const sorted = sortRows(rows);
  return sorted.map((r) => {
    const dual = Boolean(r.study_subject_id_2);
    return {
      "تاريخ الامتحان": r.exam_date,
      "التشكيل / الكلية": r.formation_label,
      "حساب المالك": r.owner_username,
      التسلسل: r.serial_no,
      "اسم القاعة": r.room_name,
      "مشرف القاعة": r.supervisor_name,
      "مادة الامتحان (جدول)": r.exam_study_subject_name,
      "مرحلة الامتحان": formatCollegeStudyStageLabel(r.exam_stage_level),
      "القسم/الفرع (جدول)": r.exam_college_subject_name,
      "نوع الجدول": scheduleTypeLabelAr(r.exam_schedule_type),
      الوجبة: formatExamMealSlotLabel(r.exam_meal_slot),
      "وقت الامتحان": examTimeRangeAr(r.exam_start_time, r.exam_end_time),
      "سعة الجلسة": r.exam_student_count,
      "قسم القاعة (تعريف)": r.college_subject_name,
      "مادة القاعة 1": r.study_subject_name,
      "مادة القاعة 2": r.study_subject_name_2 ?? "",
      "سعة القاعة 1": r.capacity_total,
      "سعة القاعة 2": dual ? r.capacity_total_2 : "",
      "حضور 1": r.attendance_count,
      "غياب 1": r.absence_count,
      المراقبون: r.invigilators ?? "",
      "معرّف الجدول": r.schedule_id,
      "معرّف القاعة": r.id,
    };
  });
}

export function adminRoomsByDateExcelFilename(examDate: string): string {
  return `exam-rooms-${examDate}.xlsx`;
}
