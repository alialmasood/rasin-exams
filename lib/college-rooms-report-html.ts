import type { CollegeExamRoomRow } from "@/lib/college-rooms";
import { formatExternalStaffPlainTextForExport } from "@/lib/room-external-staff";
import type { CollegeRoomScheduleHint } from "@/lib/college-exam-schedules";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateTimeAr(value: Date | string): string {
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("ar-IQ", {
      timeZone: "Asia/Baghdad",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "—";
  }
}

function instructorCell(row: CollegeExamRoomRow, slot: 1 | 2, escape: (s: string) => string): string {
  if (slot === 1) {
    const t = String(row.study_subject_instructor_name ?? "").trim();
    return t ? escape(t) : "—";
  }
  if (!row.study_subject_id_2) return "—";
  const t = String(row.study_subject_instructor_name_2 ?? "").trim();
  return t ? escape(t) : "—";
}

function shiftCapacityLabel(row: CollegeExamRoomRow, slot: 1 | 2): string {
  if (slot === 1) {
    return `${row.capacity_total} (ص ${row.capacity_morning} + م ${row.capacity_evening})`;
  }
  if (!row.study_subject_id_2) return "—";
  return `${row.capacity_total_2} (ص ${row.capacity_morning_2} + م ${row.capacity_evening_2})`;
}

export type CollegeRoomsReportStats = {
  totalRooms: number;
  distinctExamSubjectsInRooms: number;
  totalAttendanceSeats: number;
  totalAbsenceSeats: number;
  singleExamRooms: number;
  doubleExamRooms: number;
  totalCapacityFromShifts: number;
  subjectsSpreadAcrossMultipleRooms: number;
};

export type CollegeRoomsReportInput = {
  rows: CollegeExamRoomRow[];
  stats: CollegeRoomsReportStats;
  scheduleHintsByRoom: Record<string, CollegeRoomScheduleHint[]>;
  collegeLabel: string;
  generatedLabel: string;
};

/** مستند HTML كامل (A4) للطباعة أو الحفظ كـ PDF من نافذة المتصفح */
export function buildCollegeExamRoomsReportHtml(input: CollegeRoomsReportInput): string {
  const e = escapeHtml;
  const { rows, stats, scheduleHintsByRoom, collegeLabel, generatedLabel } = input;

  const sorted = [...rows].sort((a, b) => {
    if (a.serial_no !== b.serial_no) return a.serial_no - b.serial_no;
    return String(a.id).localeCompare(String(b.id));
  });

  const tableRows = sorted
    .map((row, index) => {
      const dual = Boolean(row.study_subject_id_2);
      const mode = dual ? "مزدوجة" : "منفردة";
      const hints = scheduleHintsByRoom[row.id] ?? [];
      const hintsText =
        hints.length === 0
          ? "—"
          : hints
              .map((h) => `${h.exam_date} ${h.start_time}–${h.end_time} (${h.study_subject_name})`)
              .join("؛ ");
      const { supervisorLine, invigilatorsLine } = formatExternalStaffPlainTextForExport(
        row.supervisor_name,
        row.invigilators,
        row.external_room_staff
      );
      return `<tr>
        <td>${index + 1}</td>
        <td class="num">${row.serial_no}</td>
        <td><strong>${e(row.room_name)}</strong></td>
        <td>${e(supervisorLine)}</td>
        <td>${e(invigilatorsLine)}</td>
        <td>${e(row.study_subject_name)}</td>
        <td class="small">${instructorCell(row, 1, e)}</td>
        <td class="num">${row.stage_level ?? 1}</td>
        <td>${e(row.study_subject_name_2 || "—")}</td>
        <td class="small">${instructorCell(row, 2, e)}</td>
        <td class="num">${row.stage_level_2 != null ? row.stage_level_2 : "—"}</td>
        <td>${e(mode)}</td>
        <td class="small">${e(shiftCapacityLabel(row, 1))}</td>
        <td class="small">${e(shiftCapacityLabel(row, 2))}</td>
        <td class="num">${row.attendance_count}${dual ? ` / ${row.attendance_count_2}` : ""}</td>
        <td class="num">${row.absence_count}${dual ? ` / ${row.absence_count_2}` : ""}</td>
        <td class="small">${e((row.absence_names || "—").slice(0, 500))}${(row.absence_names?.length ?? 0) > 500 ? "…" : ""}</td>
        <td class="small">${e((row.absence_names_2 || "—").slice(0, 500))}${(row.absence_names_2?.length ?? 0) > 500 ? "…" : ""}</td>
        <td class="small">${e(hintsText.slice(0, 800))}${hintsText.length > 800 ? "…" : ""}</td>
        <td class="small">${e(formatDateTimeAr(row.created_at))}</td>
        <td class="small">${e(formatDateTimeAr(row.updated_at))}</td>
      </tr>`;
    })
    .join("");

  const emptyRow =
    sorted.length === 0
      ? `<tr><td colspan="21" style="text-align:center;color:#64748b;padding:8mm">لا توجد قاعات مسجّلة.</td></tr>`
      : "";

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير القاعات الامتحانية — جامعة البصرة</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Noto Naskh Arabic', Tahoma, Arial, sans-serif; margin: 0; padding: 10mm; color: #0f172a; font-size: 10pt; line-height: 1.5; }
    @page { size: A4 landscape; margin: 10mm; }
    h1 { font-size: 16pt; text-align: center; margin: 0 0 3mm; border-bottom: 2px solid #274092; padding-bottom: 3mm; color: #274092; }
    .sub { text-align: center; font-size: 10pt; color: #475569; margin-bottom: 1mm; }
    h2 { font-size: 11.5pt; color: #274092; margin: 5mm 0 2mm; border-right: 4px solid #274092; padding-right: 8px; page-break-after: avoid; }
    table.data { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 7.5pt; }
    th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: right; vertical-align: top; }
    th { background: #e8eef7; font-weight: 700; color: #334155; }
    td.num { text-align: center; font-variant-numeric: tabular-nums; }
    td.small { font-size: 7pt; }
    .summary { display: table; width: 100%; border-collapse: collapse; margin-bottom: 4mm; font-size: 9.5pt; }
    .summary-row { display: table-row; }
    .summary-cell { display: table-cell; border: 1px solid #e2e8f0; padding: 7px 8px; text-align: center; background: #f8fafc; width: 14.28%; }
    .summary-val { font-size: 13pt; font-weight: 800; color: #274092; }
    .muted { color: #64748b; font-size: 8.5pt; }
    .footer { margin-top: 6mm; padding-top: 3mm; border-top: 1px solid #e2e8f0; font-size: 8.5pt; color: #64748b; text-align: center; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <h1>تقرير رسمي — جدول القاعات الامتحانية والسعات والحضور</h1>
  <p class="sub">جامعة البصرة — نظام رصين لإدارة الامتحانات</p>
  <p class="sub muted">${e(collegeLabel)}</p>
  <p class="sub muted" style="margin-bottom:5mm">تاريخ ووقت إصدار التقرير: ${e(generatedLabel)}</p>

  <h2>1. ملخص إحصائي</h2>
  <div class="summary">
    <div class="summary-row">
      <div class="summary-cell"><span class="muted">عدد القاعات</span><div class="summary-val">${stats.totalRooms}</div></div>
      <div class="summary-cell"><span class="muted">مواد امتحانية (فريدة)</span><div class="summary-val">${stats.distinctExamSubjectsInRooms}</div></div>
      <div class="summary-cell"><span class="muted">قاعات منفردة</span><div class="summary-val">${stats.singleExamRooms}</div></div>
      <div class="summary-cell"><span class="muted">قاعات مزدوجة</span><div class="summary-val">${stats.doubleExamRooms}</div></div>
      <div class="summary-cell"><span class="muted">مقاعد (سعة)</span><div class="summary-val">${stats.totalCapacityFromShifts}</div></div>
      <div class="summary-cell"><span class="muted">حضور</span><div class="summary-val">${stats.totalAttendanceSeats}</div></div>
      <div class="summary-cell"><span class="muted">غياب</span><div class="summary-val">${stats.totalAbsenceSeats}</div></div>
    </div>
    <div class="summary-row">
      <div class="summary-cell" style="width:100%;display:table-cell">
        <span class="muted">مواد امتحانية لها أكثر من قاعة (توزيع طلبة)</span>
        <div class="summary-val">${stats.subjectsSpreadAcrossMultipleRooms}</div>
      </div>
    </div>
  </div>

  <h2>2. الجدول التفصيلي للقاعات</h2>
  <p class="muted" style="margin:0 0 2mm">يشمل جميع القاعات مرتبة حسب التسلسل. عمود «مواعيد الجداول» يعرض ارتباطات الجدول الامتحاني إن وُجدت.</p>
  <table class="data">
    <thead>
      <tr>
        <th>#</th>
        <th>تسلسل</th>
        <th>اسم القاعة</th>
        <th>مشرف القاعة</th>
        <th>المراقبون</th>
        <th>المادة 1</th>
        <th>التدريسي (مادة 1)</th>
        <th>مرحلة 1</th>
        <th>المادة 2</th>
        <th>التدريسي (مادة 2)</th>
        <th>مرحلة 2</th>
        <th>الوضع</th>
        <th>سعة 1</th>
        <th>سعة 2</th>
        <th>حضور</th>
        <th>غياب</th>
        <th>أسماء غياب 1</th>
        <th>أسماء غياب 2</th>
        <th>مواعيد الجداول</th>
        <th>تاريخ الإضافة</th>
        <th>آخر تحديث</th>
      </tr>
    </thead>
    <tbody>${tableRows || emptyRow}</tbody>
  </table>

  <div class="footer">
    هذا التقرير صادر عن نظام رصين ولا يغني عن التوقيعات والختم الرسمي عند الاقتضاء.
  </div>
</body>
</html>`;
}

/** يفتح نافذة طباعة؛ يعيد false إذا حُظرت النوافذ المنبثقة */
export function printCollegeExamRoomsReportHtml(html: string): boolean {
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
      window.setTimeout(runPrint, 150);
    } else {
      w.addEventListener("load", () => window.setTimeout(runPrint, 150), { once: true });
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
