import type { AdminCollegeExamRoomRow } from "@/lib/college-rooms";

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

function shiftCapacityLabel(row: AdminCollegeExamRoomRow, slot: 1 | 2): string {
  if (slot === 1) {
    return `${row.capacity_total} (ص ${row.capacity_morning} + م ${row.capacity_evening})`;
  }
  if (!row.study_subject_id_2) return "—";
  return `${row.capacity_total_2} (ص ${row.capacity_morning_2} + م ${row.capacity_evening_2})`;
}

function subjectLine(name: string, stage: number): string {
  return `${name} — مرحلة ${stage}`;
}

function subjectsCellText(row: AdminCollegeExamRoomRow): string {
  const a = subjectLine(row.study_subject_name, row.stage_level);
  if (row.study_subject_id_2 && row.study_subject_name_2 != null && row.stage_level_2 != null) {
    return `${a} | ${subjectLine(row.study_subject_name_2, row.stage_level_2)}`;
  }
  return a;
}

function sortAdminRoomRows(rows: AdminCollegeExamRoomRow[]): AdminCollegeExamRoomRow[] {
  return [...rows].sort((a, b) => {
    const fa = a.formation_label.localeCompare(b.formation_label, "ar");
    if (fa !== 0) return fa;
    const ua = a.owner_username.localeCompare(b.owner_username);
    if (ua !== 0) return ua;
    if (a.serial_no !== b.serial_no) return a.serial_no - b.serial_no;
    return String(a.id).localeCompare(String(b.id));
  });
}

function computeAdminRoomsStats(rows: AdminCollegeExamRoomRow[]) {
  const owners = new Set(rows.map((r) => r.owner_user_id));
  let cap = 0;
  let single = 0;
  let dual = 0;
  let att = 0;
  let abs = 0;
  for (const r of rows) {
    cap += r.capacity_total;
    if (r.study_subject_id_2) {
      cap += r.capacity_total_2;
      dual += 1;
    } else {
      single += 1;
    }
    att += r.attendance_count + r.attendance_count_2;
    abs += r.absence_count + r.absence_count_2;
  }
  return {
    roomCount: rows.length,
    formationCount: owners.size,
    totalCapacity: cap,
    singleExamRooms: single,
    doubleExamRooms: dual,
    totalAttendance: att,
    totalAbsence: abs,
  };
}

export type AdminRoomsReportInput = {
  rows: AdminCollegeExamRoomRow[];
  generatedLabel: string;
  assetsBaseUrl: string;
  /** تقرير تشكيل واحد — يُعرض في العنوان والمقدمة */
  singleFormation?: {
    formationLabel: string;
    ownerUsername: string;
  };
};

export function buildAdminRoomsReportHtml(input: AdminRoomsReportInput): string {
  const e = escapeHtml;
  const { rows, generatedLabel, assetsBaseUrl, singleFormation } = input;
  const base = (assetsBaseUrl ?? "").replace(/\/$/, "");
  const logoSrc = base ? `${base}/uob-logo.png` : "/uob-logo.png";

  const sorted = sortAdminRoomRows(rows);
  const stats = computeAdminRoomsStats(sorted);

  const isSingle = Boolean(singleFormation);
  const h1 = isSingle
    ? `تقرير رسمي — قاعات امتحانية للتشكيل: ${e(singleFormation!.formationLabel)}`
    : "تقرير رسمي — جدول قاعات جميع التشكيلات والكليات";

  const scopeNote = isSingle
    ? `<p class="sub muted" style="margin-bottom:4mm">التشكيل: <strong>${e(singleFormation!.formationLabel)}</strong> — حساب المالك: <span class="mono">@${e(singleFormation!.ownerUsername)}</span></p>`
    : `<p class="sub muted" style="margin-bottom:4mm">يشمل جميع حسابات الكلية المسجّلة في النظام — بوابة الإشراف العام.</p>`;

  const tableRows = sorted
    .map((row, index) => {
      const dual = Boolean(row.study_subject_id_2);
      const mode = dual ? "امتحانان" : "واحد";
      const att = `${row.attendance_count}${dual ? ` / ${row.attendance_count_2}` : ""}`;
      const abs = `${row.absence_count}${dual ? ` / ${row.absence_count_2}` : ""}`;
      const cap1 = shiftCapacityLabel(row, 1);
      const cap2 = dual ? shiftCapacityLabel(row, 2) : "—";
      return `<tr>
        <td>${index + 1}</td>
        ${isSingle ? "" : `<td>${e(row.formation_label)}</td><td class="mono">${e(row.owner_username)}</td>`}
        <td class="num">${row.serial_no}</td>
        <td><strong>${e(row.room_name)}</strong></td>
        <td>${e(row.supervisor_name)}</td>
        <td style="font-size:8.8pt">${e(subjectsCellText(row))}</td>
        <td>${e(mode)}</td>
        <td style="font-size:8.5pt">${e(cap1)}${dual ? `<br/>${e(cap2)}` : ""}</td>
        <td class="num">${e(att)}</td>
        <td class="num">${e(abs)}</td>
        <td style="font-size:8.5pt;max-width:42mm;word-break:break-word">${e((row.invigilators || "—").slice(0, 400))}${(row.invigilators?.length ?? 0) > 400 ? "…" : ""}</td>
        <td style="font-size:8.5pt">${e(formatDateTimeAr(row.updated_at))}</td>
      </tr>`;
    })
    .join("");

  const emptyColspan = isSingle ? 11 : 13;
  const emptyRow = `<tr><td colspan="${emptyColspan}" style="text-align:center;color:#64748b;padding:10mm">لا توجد قاعات في النطاق المحدد.</td></tr>`;

  const headFormationCols = isSingle
    ? ""
    : `<th>التشكيل / الكلية</th><th>حساب المالك</th>`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير قاعات التشكيلات — جامعة البصرة</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Noto Naskh Arabic', Tahoma, Arial, sans-serif; margin: 0; padding: 10mm; color: #0f172a; font-size: 10pt; line-height: 1.45; }
    @page { size: A4 landscape; margin: 12mm; }
    .report-brand {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 10px;
      margin: 0 0 5mm;
      padding-bottom: 4mm;
      border-bottom: 1px solid #e2e8f0;
    }
    .report-brand-side { font-size: 10.5pt; font-weight: 800; color: #1e3a8a; line-height: 1.35; }
    .report-brand-college-side { text-align: left; }
    .report-brand-uni-side { text-align: right; }
    .report-brand-logo-wrap { display: flex; justify-content: center; align-items: center; }
    .report-brand-logo { height: 52px; width: auto; max-width: 96px; object-fit: contain; display: block; }
    h1 { font-size: 14pt; text-align: center; margin: 0 0 3mm; border-bottom: 2px solid #1e3a8a; padding-bottom: 3mm; color: #1e3a8a; }
    .sub { text-align: center; font-size: 9.5pt; color: #475569; margin-bottom: 1mm; }
    .mono { font-family: Consolas, ui-monospace, monospace; font-size: 9pt; }
    h2 { font-size: 11pt; color: #1e3a8a; margin: 4mm 0 2mm; border-right: 4px solid #2563eb; padding-right: 8px; page-break-after: avoid; }
    table.data { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 8.8pt; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: right; vertical-align: top; }
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
    <div class="report-brand-side report-brand-college-side">الإشراف على قاعات التشكيلات</div>
    <div class="report-brand-logo-wrap">
      <img class="report-brand-logo" src="${e(logoSrc)}" width="96" height="96" alt="" />
    </div>
    <div class="report-brand-side report-brand-uni-side">جامعة البصرة</div>
  </div>
  <h1>${h1}</h1>
  <p class="sub">نظام رصين لإدارة الامتحانات</p>
  <p class="sub muted" style="margin-bottom:3mm">تاريخ ووقت إصدار التقرير: ${e(generatedLabel)}</p>
  ${scopeNote}

  <h2>1. ملخص إحصائي</h2>
  <div class="summary">
    <div class="summary-row">
      <div class="summary-cell"><span class="muted">عدد القاعات</span><div class="summary-val">${stats.roomCount}</div></div>
      <div class="summary-cell"><span class="muted">عدد التشكيلات (حسابات)</span><div class="summary-val">${stats.formationCount}</div></div>
      <div class="summary-cell"><span class="muted">مجموع السعة</span><div class="summary-val">${stats.totalCapacity}</div></div>
      <div class="summary-cell"><span class="muted">قاعات بامتحان واحد / اثنين</span><div class="summary-val" style="font-size:10pt">${stats.singleExamRooms} / ${stats.doubleExamRooms}</div></div>
      <div class="summary-cell"><span class="muted">مجموع الحضور / الغياب (المقاعد)</span><div class="summary-val" style="font-size:10pt">${stats.totalAttendance} / ${stats.totalAbsence}</div></div>
    </div>
  </div>

  <h2>2. الجدول التفصيلي للقاعات</h2>
  <p class="muted" style="margin:0 0 2mm;font-size:8.5pt">بيانات كما في لوحة «قاعات التشكيلات» للمشرف؛ أعمدة الحضور والغياب للامتحان الأول والثاني عند القاعة المزدوجة.</p>
  <table class="data">
    <thead>
      <tr>
        <th>#</th>
        ${headFormationCols}
        <th>تسلسل</th>
        <th>اسم القاعة</th>
        <th>مشرف القاعة</th>
        <th>المادتان / المرحلة</th>
        <th>الوضع</th>
        <th>السعة (ص+م)</th>
        <th>الحضور</th>
        <th>الغياب</th>
        <th>المراقبون</th>
        <th>آخر تحديث</th>
      </tr>
    </thead>
    <tbody>${sorted.length ? tableRows : emptyRow}</tbody>
  </table>

  <div class="footer">
    هذا التقرير صادر عن نظام رصين ولا يغني عن التوقيعات والختم الرسمي عند الاقتضاء.
  </div>
</body>
</html>`;
}

export function printAdminRoomsReportHtml(html: string): boolean {
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

/** صفوف جاهزة لـ xlsx.utils.json_to_sheet — تفاصيل رسمية كاملة */
export function adminRoomsRowsToExcelRecords(rows: AdminCollegeExamRoomRow[]): Record<string, string | number>[] {
  const df = new Intl.DateTimeFormat("ar-IQ", {
    timeZone: "Asia/Baghdad",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const sorted = sortAdminRoomRows(rows);
  return sorted.map((r) => {
    const dual = Boolean(r.study_subject_id_2);
    return {
      "التشكيل / الكلية": r.formation_label,
      "حساب المالك": r.owner_username,
      التسلسل: r.serial_no,
      "اسم القاعة": r.room_name,
      "مشرف القاعة": r.supervisor_name,
      "المادة الامتحانية 1": r.study_subject_name,
      "المرحلة 1": r.stage_level,
      "المادة الامتحانية 2": r.study_subject_name_2 ?? "",
      "المرحلة 2": r.stage_level_2 ?? "",
      "نوع القاعة": dual ? "امتحانان (مادتان)" : "امتحان واحد",
      "سعة إجمالية 1": r.capacity_total,
      "صباحي 1": r.capacity_morning,
      "مسائي 1": r.capacity_evening,
      "سعة إجمالية 2": dual ? r.capacity_total_2 : "",
      "صباحي 2": dual ? r.capacity_morning_2 : "",
      "مسائي 2": dual ? r.capacity_evening_2 : "",
      "حضور (امتحان 1)": r.attendance_count,
      "حضور (امتحان 2)": r.attendance_count_2,
      "غياب (امتحان 1)": r.absence_count,
      "غياب (امتحان 2)": r.absence_count_2,
      "أسماء الغياب 1": r.absence_names ?? "",
      "أسماء الغياب 2": r.absence_names_2 ?? "",
      المراقبون: r.invigilators ?? "",
      "تاريخ الإنشاء": df.format(new Date(r.created_at)),
      "آخر تحديث": df.format(new Date(r.updated_at)),
      "معرّف السجل": r.id,
    };
  });
}

function asciiFilenameSlug(label: string): string {
  const s = label
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return s || "formation";
}

export function adminRoomsExcelFilename(rows: AdminCollegeExamRoomRow[], singleFormationLabel?: string): string {
  if (singleFormationLabel) {
    return `rooms-${asciiFilenameSlug(singleFormationLabel)}.xlsx`;
  }
  return "admin-all-formations-rooms.xlsx";
}
