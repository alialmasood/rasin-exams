function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateTimeAr(value: Date): string {
  try {
    if (Number.isNaN(value.getTime())) return "—";
    return new Intl.DateTimeFormat("ar-IQ", {
      timeZone: "Asia/Baghdad",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  } catch {
    return "—";
  }
}

function formatExamDateLongAr(dateIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return dateIso;
  try {
    return new Intl.DateTimeFormat("ar-IQ", {
      timeZone: "Asia/Baghdad",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(`${dateIso}T12:00:00`));
  } catch {
    return dateIso;
  }
}

export type AdminTodayExamsReportRow = {
  formation_label: string;
  college_subject_name: string;
  study_subject_name: string;
  stage_label: string;
  study_type_label: string;
  meal_label: string;
  room_sessions: number;
  total_students_in_rooms: number;
};

export type AdminTodayExamsReportInput = {
  examDate: string;
  formationCount: number;
  rows: AdminTodayExamsReportRow[];
  generatedAt: Date;
  assetsBaseUrl: string;
};

/** مستند HTML للطباعة أو الحفظ كـ PDF (A4 عمودي) من نافذة المتصفح */
export function buildAdminTodayExamsReportHtml(input: AdminTodayExamsReportInput): string {
  const e = escapeHtml;
  const base = (input.assetsBaseUrl ?? "").replace(/\/$/, "");
  const logoSrc = base ? `${base}/uob-logo.png` : "/uob-logo.png";
  const dateLong = formatExamDateLongAr(input.examDate);
  const generatedLabel = formatDateTimeAr(input.generatedAt);
  const totalStudents = input.rows.reduce((s, r) => s + r.total_students_in_rooms, 0);
  const totalSessions = input.rows.reduce((s, r) => s + r.room_sessions, 0);

  const bodyRows =
    input.rows.length === 0
      ? `<tr><td colspan="9" style="text-align:center;padding:10mm;color:#64748b;font-weight:600">لا توجد جداول امتحانية مسجّلة لهذا التاريخ.</td></tr>`
      : input.rows
          .map(
            (r, i) => `<tr>
        <td style="text-align:center;font-weight:700">${i + 1}</td>
        <td><strong>${e(r.formation_label)}</strong></td>
        <td>${e(r.college_subject_name)}</td>
        <td>${e(r.study_subject_name)}</td>
        <td>${e(r.stage_label)}</td>
        <td>${e(r.study_type_label)}</td>
        <td style="font-weight:800;color:#1e3a8a">${e(r.meal_label)}</td>
        <td style="text-align:center;font-weight:800">${r.room_sessions}</td>
        <td style="text-align:center;font-weight:900;font-size:10.5pt">${r.total_students_in_rooms}</td>
      </tr>`
          )
          .join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير امتحانات اليوم — ${e(input.examDate)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Arial (Body CS)", Arial, Tahoma, sans-serif;
      margin: 0;
      padding: 11mm 12mm 12mm;
      color: #0f172a;
      font-size: 9.8pt;
      line-height: 1.45;
    }
    @page { size: A4 portrait; margin: 12mm 11mm 14mm; }
    .report-brand {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 8px;
      margin: 0 0 5mm;
      padding-bottom: 4mm;
      border-bottom: 1px solid #cbd5e1;
    }
    .report-brand-side { font-size: 10.5pt; font-weight: 800; color: #1e3a8a; line-height: 1.35; }
    .report-brand-college-side { text-align: left; }
    .report-brand-uni-side { text-align: right; }
    .report-brand-logo-wrap { display: flex; justify-content: center; align-items: center; }
    .report-brand-logo { height: 52px; width: auto; max-width: 96px; object-fit: contain; display: block; }
    h1 {
      font-size: 16pt;
      text-align: center;
      margin: 0 0 2mm;
      padding-bottom: 3mm;
      border-bottom: 2px solid #1e3a8a;
      color: #1e3a8a;
      font-weight: 900;
    }
    .sub { text-align: center; font-size: 9.5pt; color: #475569; margin: 1mm 0 0; }
    .date-banner {
      margin: 4mm 0 5mm;
      padding: 3mm 4mm;
      background: linear-gradient(180deg, #eff6ff 0%, #e0e7ff 100%);
      border: 1px solid #93c5fd;
      border-radius: 6px;
      text-align: center;
      font-size: 10.5pt;
      font-weight: 800;
      color: #1e3a8a;
    }
    .meta {
      display: table;
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 4mm;
      font-size: 9.2pt;
    }
    .meta-row { display: table-row; }
    .meta-cell {
      display: table-cell;
      border: 1px solid #e2e8f0;
      padding: 6px 8px;
      text-align: center;
      background: #f8fafc;
      width: 33.33%;
    }
    .meta-val { font-size: 13pt; font-weight: 900; color: #1e3a8a; }
    table.data {
      width: 100%;
      border-collapse: collapse;
      margin: 2mm 0 4mm;
      font-size: 8.9pt;
    }
    th, td {
      border: 1px solid #94a3b8;
      padding: 5px 6px;
      text-align: right;
      vertical-align: middle;
    }
    th {
      background: #1e3a8a;
      color: #fff;
      font-weight: 800;
      font-size: 8.5pt;
      white-space: nowrap;
    }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .pdf-hint {
      font-size: 8.8pt;
      color: #64748b;
      text-align: center;
      margin: 3mm 0 2mm;
      padding: 2mm;
      border: 1px dashed #cbd5e1;
      border-radius: 4px;
    }
    .footer {
      margin-top: 5mm;
      padding-top: 3mm;
      border-top: 1px solid #e2e8f0;
      font-size: 8.5pt;
      color: #64748b;
      text-align: center;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    @media print {
      body { padding: 0; }
      .pdf-hint { font-size: 8pt; }
    }
  </style>
</head>
<body>
  <div class="report-brand" dir="ltr">
    <div class="report-brand-side report-brand-college-side">لوحة إدارة النظام — امتحانات اليوم</div>
    <div class="report-brand-logo-wrap">
      <img class="report-brand-logo" src="${e(logoSrc)}" width="96" height="96" alt="" />
    </div>
    <div class="report-brand-side report-brand-uni-side">جامعة البصرة</div>
  </div>
  <h1>تقرير رسمي — امتحانات التشكيلات حسب اليوم</h1>
  <p class="sub">نظام رصين لإدارة الامتحانات — ورقة قياس A4 (عمودي)</p>
  <div class="date-banner">${e(dateLong)}</div>
  <div class="meta">
    <div class="meta-row">
      <div class="meta-cell"><div style="color:#64748b;font-weight:600">تاريخ التقرير</div><div class="meta-val" style="font-size:10pt">${e(generatedLabel)}</div></div>
      <div class="meta-cell"><div style="color:#64748b;font-weight:600">تشكيلات بامتحان</div><div class="meta-val">${input.formationCount}</div></div>
      <div class="meta-cell"><div style="color:#64748b;font-weight:600">إجمالي الطلبة (جميع الصفوف)</div><div class="meta-val">${totalStudents}</div></div>
    </div>
  </div>
  <p style="margin:0 0 2mm;font-size:8.8pt;color:#475569;text-align:center">جلسات القاعات في الجدول: <strong>${totalSessions}</strong> — الصفوف المجمّعة: <strong>${input.rows.length}</strong></p>
  <table class="data">
    <thead>
      <tr>
        <th>#</th>
        <th>التشكيل</th>
        <th>القسم / الفرع</th>
        <th>المادة الامتحانية</th>
        <th>المرحلة</th>
        <th>نوع الدراسة</th>
        <th>الوجبة</th>
        <th>جلسات القاعات</th>
        <th>إجمالي الطلبة في القاعات</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <p class="pdf-hint">لحفظ ملف PDF: من نافذة الطباعة اختر «Save as PDF» أو «Microsoft Print to PDF». يعكس التقرير البيانات وقت الإنشاء.</p>
  <div class="footer">تقرير إلكتروني — لا يغني عن الإجراءات الرسمية عند الاقتضاء.</div>
</body>
</html>`;
}
