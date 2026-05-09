import type { AdminOfficialSituationFollowupRow } from "@/lib/college-exam-situations";
import { formatCollegeStudyStageLabel } from "@/lib/college-study-stage-display";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatExamDateAr(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory-nu-latn", {
      dateStyle: "full",
      timeZone: "Asia/Baghdad",
    }).format(new Date(`${isoDate}T12:00:00`));
  } catch {
    return isoDate;
  }
}

function formatGeneratedAt(when: Date): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory-nu-latn", {
      timeZone: "Asia/Baghdad",
      dateStyle: "full",
      timeStyle: "short",
    }).format(when);
  } catch {
    return when.toISOString();
  }
}

function deptStatusLabel(s: AdminOfficialSituationFollowupRow["dean_status"]): string {
  if (s === "APPROVED") return "معتمد";
  if (s === "REJECTED") return "مرفوض";
  if (s === "PENDING") return "قيد المراجعة";
  return "غير معتمد";
}

function authStatusLabel(uploaded: boolean): string {
  return uploaded ? "مصادق" : "غير مصادق";
}

function examTypeLabel(s: AdminOfficialSituationFollowupRow["schedule_type"]): string {
  return s === "SEMESTER" ? "فصلي" : "نهائي";
}

export function buildAdminDailySituationsReportHtml(input: {
  examDate: string;
  rows: AdminOfficialSituationFollowupRow[];
  generatedAt: Date;
}): string {
  const z = esc;
  const rowsHtml = input.rows
    .map(
      (r, i) => `<tr>
  <td>${i + 1}</td>
  <td>${z(r.formation_label)}</td>
  <td>${z(r.branch_name)}</td>
  <td>${z(r.subject_name)}</td>
  <td>${z(formatCollegeStudyStageLabel(r.stage_level))}</td>
  <td>${r.meal_slot === 2 ? "الثانية" : "الأولى"}</td>
  <td>${z(examTypeLabel(r.schedule_type))}</td>
  <td>${z(deptStatusLabel(r.dean_status))}</td>
  <td>${z(authStatusLabel(r.is_uploaded))}</td>
</tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>التقرير اليومي للمواقف الامتحانية — ${z(input.examDate)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Tajawal", "Segoe UI", Tahoma, Arial, sans-serif; margin: 0; padding: 14px 16px 18px; color: #111827; background: #fff; }
    @page { size: A4 landscape; margin: 10mm; }
    @media print { body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    .hdr { border-bottom: 3px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 12px; }
    .hdr h1 { margin: 0; color: #1e3a8a; font-size: 20px; text-align: center; font-weight: 800; }
    .meta { margin-top: 6px; text-align: center; font-size: 13px; color: #374151; }
    .table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
    .table th, .table td { border: 1px solid #9ca3af; padding: 6px 4px; text-align: center; vertical-align: middle; }
    .table th { background: #e5e7eb; font-weight: 800; }
    .table tbody tr:nth-child(odd) { background: #f8fafc; }
    .footer { margin-top: 10px; padding-top: 6px; border-top: 1px solid #d1d5db; text-align: center; font-size: 11px; color: #4b5563; }
  </style>
</head>
<body>
  <header class="hdr">
    <h1>التقرير اليومي الرسمي للمواقف الامتحانية</h1>
    <div class="meta"><strong>جامعة البصرة</strong> — لوحة متابعة المواقف (الإدارة)</div>
    <div class="meta"><strong>اليوم الامتحاني:</strong> ${z(formatExamDateAr(input.examDate))}</div>
    <div class="meta"><strong>عدد السجلات:</strong> ${input.rows.length} — <strong>وقت إصدار التقرير:</strong> ${z(formatGeneratedAt(input.generatedAt))}</div>
  </header>

  <table class="table">
    <thead>
      <tr>
        <th>ت</th>
        <th>اسم التشكيل</th>
        <th>القسم / الفرع</th>
        <th>المادة الامتحانية</th>
        <th>المرحلة</th>
        <th>الوجبة</th>
        <th>نوع الامتحان</th>
        <th>اعتماد رئيس القسم/الفرع</th>
        <th>مصادقة حساب العميد</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="9">لا توجد مواقف لهذا اليوم.</td></tr>`}
    </tbody>
  </table>

  <footer class="footer">قياس الورق: A4 أفقي — يمكن الحفظ PDF مباشرة من نافذة الطباعة.</footer>
</body>
</html>`;
}
