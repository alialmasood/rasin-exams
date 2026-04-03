import type { AdminCollegeExamScheduleRow } from "@/lib/college-exam-schedules";
import { formatExamMealSlotLabel } from "@/lib/exam-meal-slot";

const SCHEDULE_TYPE_SHORT: Record<AdminCollegeExamScheduleRow["schedule_type"], string> = {
  FINAL: "نهائي",
  SEMESTER: "فصلي",
};

const WORKFLOW_LABEL: Record<AdminCollegeExamScheduleRow["workflow_status"], string> = {
  DRAFT: "مسودة",
  SUBMITTED: "مُرسَل / معتمد",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
};

export type FormationScheduleDeptExport = {
  deptName: string;
  sessions: AdminCollegeExamScheduleRow[][];
};

export type FormationScheduleExportInput = {
  formationLabel: string;
  ownerUsername: string;
  departments: FormationScheduleDeptExport[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} س و${m} د`;
  if (h > 0) return h === 1 ? "ساعة" : `${h} ساعات`;
  return `${m} د`;
}

function weekdayAr(dateIso: string): string {
  if (!dateIso) return "";
  try {
    return new Intl.DateTimeFormat("ar-IQ", { weekday: "long" }).format(new Date(dateIso));
  } catch {
    return "";
  }
}

function timeRangeLabel(start: string, end: string): string {
  return `${start || "--:--"} – ${end || "--:--"}`;
}

function roomsLabel(sess: AdminCollegeExamScheduleRow[]): string {
  if (sess.length <= 1) return sess[0]?.room_name ?? "—";
  return sess.map((m) => m.room_name).join("؛ ");
}

/** طباعة / حفظ PDF من نافذة المتصفح */
export function printFormationExamScheduleHtml(html: string): boolean {
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

/**
 * تقرير HTML للجدول الامتحاني لتشكيل واحد؛ كل قسم/فرع في قسم منفصل (h2 + جدول).
 */
export function buildFormationExamSchedulePrintHtml(
  input: FormationScheduleExportInput,
  generatedLabel: string
): string {
  const e = escapeHtml;
  const logoSrc = "/uob-logo.png";

  const deptSections = input.departments
    .map((d) => {
      let seq = 0;
      const rows = d.sessions
        .map((sess) => {
          seq += 1;
          const r = sess[0]!;
          const st = r.workflow_status;
          const multi = sess.length > 1;
          return `<tr>
            <td class="num">${seq}</td>
            <td>${e(SCHEDULE_TYPE_SHORT[r.schedule_type])}</td>
            <td>${e(r.study_subject_name)}${multi ? ` <span class="tag">${sess.length} قاعات</span>` : ""}</td>
            <td class="num">${r.stage_level}</td>
            <td class="num">${e(r.exam_date)}</td>
            <td>${e(formatExamMealSlotLabel(r.meal_slot))}</td>
            <td>${e(weekdayAr(r.exam_date))}</td>
            <td class="num">${e(timeRangeLabel(r.start_time, r.end_time))}</td>
            <td class="num">${e(formatDuration(r.duration_minutes))}</td>
            <td>${e(roomsLabel(sess))}</td>
            <td>${e(r.academic_year || "—")} · ${e(r.term_label || "—")}</td>
            <td class="num">${e(WORKFLOW_LABEL[st])}</td>
          </tr>`;
        })
        .join("");

      return `<section class="dept-block">
        <h2>القسم / الفرع: ${e(d.deptName)}</h2>
        <p class="dept-meta">${d.sessions.length} جلسة امتحانية</p>
        <table class="data">
          <thead>
            <tr>
              <th>#</th>
              <th>نوع الجدول</th>
              <th>المادة</th>
              <th>مرحلة</th>
              <th>التاريخ</th>
              <th>الوجبة</th>
              <th>اليوم</th>
              <th>الوقت</th>
              <th>المدة</th>
              <th>القاعة</th>
              <th>عام / فصل</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="12" class="muted">لا توجد جلسات</td></tr>`}</tbody>
        </table>
      </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>جدول امتحاني — ${e(input.formationLabel)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Noto Naskh Arabic', Tahoma, Arial, sans-serif; margin: 0; padding: 10mm; color: #0f172a; font-size: 9.5pt; line-height: 1.45; }
    @page { size: A4 landscape; margin: 10mm; }
    .report-brand { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; margin: 0 0 4mm; padding-bottom: 3mm; border-bottom: 1px solid #e2e8f0; }
    .report-brand-side { font-size: 10pt; font-weight: 800; color: #1e3a8a; }
    .report-brand-college-side { text-align: left; }
    .report-brand-uni-side { text-align: right; }
    .report-brand-logo { height: 48px; width: auto; max-width: 88px; object-fit: contain; }
    h1 { font-size: 13pt; text-align: center; margin: 0 0 2mm; color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 2mm; }
    .sub { text-align: center; font-size: 9pt; color: #475569; margin: 0 0 4mm; }
    .mono { font-family: Consolas, ui-monospace, monospace; font-size: 8.5pt; }
    h2 { font-size: 11pt; color: #1e3a8a; margin: 5mm 0 2mm; padding-right: 8px; border-right: 4px solid #2563eb; page-break-after: avoid; }
    .dept-meta { font-size: 8.5pt; color: #64748b; margin: 0 0 2mm; }
    .dept-block { page-break-inside: auto; margin-bottom: 6mm; }
    table.data { width: 100%; border-collapse: collapse; margin: 2mm 0; font-size: 8.2pt; }
    th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: right; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; color: #334155; }
    td.num { text-align: center; font-variant-numeric: tabular-nums; }
    .muted { color: #64748b; text-align: center; }
    .tag { display: inline-block; margin-right: 4px; padding: 1px 5px; border-radius: 4px; background: #e0e7ff; color: #3730a3; font-size: 7.5pt; font-weight: 700; }
    .footer { margin-top: 5mm; padding-top: 3mm; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #64748b; text-align: center; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="report-brand" dir="ltr">
    <div class="report-brand-side report-brand-college-side">متابعة الجداول الامتحانية</div>
    <div style="text-align:center"><img class="report-brand-logo" src="${e(logoSrc)}" alt="" /></div>
    <div class="report-brand-side report-brand-uni-side">جامعة البصرة</div>
  </div>
  <h1>الجدول الامتحاني — ${e(input.formationLabel)}</h1>
  <p class="sub">حساب المالك: <span class="mono">@${e(input.ownerUsername)}</span> — أقسام منفصلة أدناه — <span class="mono">${e(generatedLabel)}</span></p>
  ${deptSections}
  <div class="footer">يُحفظ كملف PDF من نافذة الطباعة (اختر «حفظ كـ PDF» إن وُجد).</div>
</body>
</html>`;
}

function excelSheetNameSafe(name: string, used: Set<string>): string {
  let base = name
    .replace(/[\\/*?:\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28);
  if (!base) base = "قسم";
  let candidate = base;
  let n = 1;
  while (used.has(candidate)) {
    const suffix = ` ${n++}`;
    candidate = (base.slice(0, 31 - suffix.length) + suffix).slice(0, 31);
  }
  used.add(candidate);
  return candidate;
}

/** تصدير Excel: ورقة لكل قسم/فرع بمعزل عن الآخر */
export async function exportFormationExamScheduleExcel(
  input: FormationScheduleExportInput,
  fileBaseName: string
): Promise<void> {
  const xlsx = await import("xlsx");
  const wb = xlsx.utils.book_new();
  const usedNames = new Set<string>();

  if (input.departments.length === 0) {
    const ws = xlsx.utils.aoa_to_sheet([["لا توجد أقسام أو جلسات في هذا التشكيل"]]);
    xlsx.utils.book_append_sheet(wb, ws, "تقرير");
    const safeEmpty =
      `${input.formationLabel}-${input.ownerUsername}`
        .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_")
        .trim()
        .slice(0, 100) || "jadwal";
    xlsx.writeFile(wb, `${safeEmpty}.xlsx`);
    return;
  }

  for (const d of input.departments) {
    const sheetName = excelSheetNameSafe(d.deptName, usedNames);
    let seq = 0;
    const rows = d.sessions.map((sess) => {
      seq += 1;
      const r = sess[0]!;
      return {
        "#": seq,
        "نوع الجدول": SCHEDULE_TYPE_SHORT[r.schedule_type],
        المادة: r.study_subject_name,
        مرحلة: r.stage_level,
        التاريخ: r.exam_date,
        الوجبة: formatExamMealSlotLabel(r.meal_slot),
        اليوم: weekdayAr(r.exam_date),
        الوقت: timeRangeLabel(r.start_time, r.end_time),
        المدة: formatDuration(r.duration_minutes),
        القاعة: roomsLabel(sess),
        "عام دراسي": r.academic_year ?? "—",
        "فصل / تسمية": r.term_label ?? "—",
        الحالة: WORKFLOW_LABEL[r.workflow_status],
        "عدد قاعات الجلسة": sess.length,
      };
    });
    const ws = xlsx.utils.json_to_sheet(rows.length ? rows : [{ ملاحظة: "لا توجد جلسات في هذا القسم" }]);
    xlsx.utils.book_append_sheet(wb, ws, sheetName);
  }

  const safeFile =
    fileBaseName.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_").trim().slice(0, 120) || "jadwal";
  xlsx.writeFile(wb, `${safeFile}.xlsx`);
}

export function formationExportNowLabel(): string {
  return new Intl.DateTimeFormat("ar-IQ", {
    timeZone: "Asia/Baghdad",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
}
