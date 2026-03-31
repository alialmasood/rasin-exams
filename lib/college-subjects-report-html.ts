import type { CollegeSubjectRow, CollegeSubjectUsageRow } from "@/lib/college-subjects";

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

export type CollegeSubjectsReportInput = {
  rows: CollegeSubjectRow[];
  usageRows: CollegeSubjectUsageRow[];
  generatedLabel: string;
  /** اسم التشكيل / الكلية كما في الحساب */
  collegeLabel: string;
  /**
   * أصل الموقع (مثل https://example.com) لبناء مسار مطلق للشعار؛
   * مطلوب لأن نافذة الطباعة قد تكون about:blank فلا تعمل المسارات النسبية.
   */
  assetsBaseUrl: string;
};

/** مستند HTML كامل (A4) للطباعة أو الحفظ كـ PDF من نافذة المتصفح */
export function buildCollegeSubjectsReportHtml(input: CollegeSubjectsReportInput): string {
  const e = escapeHtml;
  const { rows, usageRows, generatedLabel, collegeLabel, assetsBaseUrl } = input;
  const collegeLine = (collegeLabel ?? "").trim() || "—";
  const base = (assetsBaseUrl ?? "").replace(/\/$/, "");
  const logoSrc = base ? `${base}/uob-logo.png` : "/uob-logo.png";

  const usageMap = new Map<string, CollegeSubjectUsageRow>();
  for (const u of usageRows) {
    usageMap.set(u.college_subject_id, u);
  }

  const departments = rows.filter((r) => r.branch_type === "DEPARTMENT").length;
  const branches = rows.filter((r) => r.branch_type === "BRANCH").length;
  const totalRecords = rows.length;

  let latestCreated: Date | null = null;
  let latestUpdated: Date | null = null;
  for (const r of rows) {
    const c = r.created_at instanceof Date ? r.created_at : new Date(r.created_at);
    const u = r.updated_at instanceof Date ? r.updated_at : new Date(r.updated_at);
    if (!Number.isNaN(c.getTime()) && (!latestCreated || c > latestCreated)) latestCreated = c;
    if (!Number.isNaN(u.getTime()) && (!latestUpdated || u > latestUpdated)) latestUpdated = u;
  }

  let totalStudy = 0;
  let totalExams = 0;
  for (const u of usageRows) {
    totalStudy += u.study_subjects_count;
    totalExams += u.exam_schedules_count;
  }

  const tableRows = rows
    .map((row, index) => {
      const u = usageMap.get(row.id);
      const study = u?.study_subjects_count ?? 0;
      const exams = u?.exam_schedules_count ?? 0;
      const typeLabel = row.branch_type === "BRANCH" ? "فرع" : "قسم";
      return `<tr>
        <td>${index + 1}</td>
        <td>${e(typeLabel)}</td>
        <td><strong>${e(row.branch_name)}</strong></td>
        <td>${e(row.branch_head_name)}</td>
        <td>${e(formatDateTimeAr(row.created_at))}</td>
        <td>${e(formatDateTimeAr(row.updated_at))}</td>
        <td style="text-align:center;font-weight:700">${study}</td>
        <td style="text-align:center;font-weight:700">${exams}</td>
      </tr>`;
    })
    .join("");

  const emptyRow =
    rows.length === 0
      ? `<tr><td colspan="8" style="text-align:center;color:#64748b;padding:10mm">لا توجد أقسام أو فروع مسجّلة.</td></tr>`
      : "";

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير الأقسام والفروع — جامعة البصرة</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Noto Naskh Arabic', Tahoma, Arial, sans-serif; margin: 0; padding: 12mm; color: #0f172a; font-size: 10.5pt; line-height: 1.55; }
    @page { size: A4; margin: 14mm; }
    /* LTR: يسار الشعار = اسم الكلية | الوسط = الشعار | يمين الشعار = جامعة البصرة */
    .report-brand {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 10px;
      margin: 0 0 6mm;
      padding-bottom: 5mm;
      border-bottom: 1px solid #e2e8f0;
    }
    .report-brand-side { font-size: 11pt; font-weight: 800; color: #1e3a8a; line-height: 1.35; }
    .report-brand-college-side { text-align: left; }
    .report-brand-uni-side { text-align: right; }
    .report-brand-logo-wrap { display: flex; justify-content: center; align-items: center; }
    .report-brand-logo { height: 56px; width: auto; max-width: 100px; object-fit: contain; display: block; }
    h1 { font-size: 17pt; text-align: center; margin: 0 0 4mm; border-bottom: 2px solid #1e3a8a; padding-bottom: 4mm; color: #1e3a8a; }
    .sub { text-align: center; font-size: 10pt; color: #475569; margin-bottom: 2mm; }
    h2 { font-size: 12pt; color: #1e3a8a; margin: 6mm 0 3mm; border-right: 4px solid #2563eb; padding-right: 8px; page-break-after: avoid; }
    table.data { width: 100%; border-collapse: collapse; margin: 2mm 0 5mm; font-size: 9.5pt; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: right; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; color: #334155; }
    .summary { display: table; width: 100%; border-collapse: collapse; margin-bottom: 5mm; font-size: 10pt; }
    .summary-row { display: table-row; }
    .summary-cell { display: table-cell; border: 1px solid #e2e8f0; padding: 8px 10px; width: 25%; text-align: center; background: #f8fafc; }
    .summary-val { font-size: 14pt; font-weight: 800; color: #1e3a8a; }
    .muted { color: #64748b; font-size: 9pt; }
    .footer { margin-top: 8mm; padding-top: 4mm; border-top: 1px solid #e2e8f0; font-size: 9pt; color: #64748b; text-align: center; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="report-brand" dir="ltr">
    <div class="report-brand-side report-brand-college-side">${e(collegeLine)}</div>
    <div class="report-brand-logo-wrap">
      <img class="report-brand-logo" src="${e(logoSrc)}" width="100" height="100" alt="" />
    </div>
    <div class="report-brand-side report-brand-uni-side">جامعة البصرة</div>
  </div>
  <h1>تقرير رسمي — الأقسام والفروع والربط بالمواد والامتحانات</h1>
  <p class="sub">نظام رصين لإدارة الامتحانات</p>
  <p class="sub muted" style="margin-bottom:6mm">تاريخ ووقت إصدار التقرير: ${e(generatedLabel)}</p>

  <h2>1. ملخص إحصائي</h2>
  <div class="summary">
    <div class="summary-row">
      <div class="summary-cell"><span class="muted">عدد الأقسام</span><div class="summary-val">${departments}</div></div>
      <div class="summary-cell"><span class="muted">عدد الفروع</span><div class="summary-val">${branches}</div></div>
      <div class="summary-cell"><span class="muted">إجمالي السجلات</span><div class="summary-val">${totalRecords}</div></div>
      <div class="summary-cell"><span class="muted">المواد + الجداول (إجمالي النظام)</span><div class="summary-val" style="font-size:11pt">${totalStudy} / ${totalExams}</div></div>
    </div>
  </div>
  <table class="data" style="margin-bottom:5mm">
    <tr><th style="width:22%">أحدث تاريخ إضافة</th><td>${latestCreated ? e(formatDateTimeAr(latestCreated)) : "—"}</td></tr>
    <tr><th>أحدث تاريخ تحديث</th><td>${latestUpdated ? e(formatDateTimeAr(latestUpdated)) : "—"}</td></tr>
  </table>

  <h2>2. جدول الأقسام والفروع والربط</h2>
  <p class="muted" style="margin:0 0 3mm">يشمل جميع السجلات كما في لوحة «الأقسام والفروع» — أعمدة المواد والامتحانات تعكس العدد المرتبط بكل قسم/فرع في النظام.</p>
  <table class="data">
    <thead>
      <tr>
        <th>#</th>
        <th>النوع</th>
        <th>اسم القسم أو الفرع</th>
        <th>رئيس القسم</th>
        <th>تاريخ الإضافة</th>
        <th>آخر تحديث</th>
        <th>المواد الدراسية</th>
        <th>جداول الامتحانات</th>
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
export function printCollegeSubjectsReportHtml(html: string): boolean {
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
