import type { CollegeRoomScheduleHint } from "@/lib/college-exam-schedules";
import type { CollegeExamRoomRow } from "@/lib/college-rooms";

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

/** مستند HTML كامل (A4) للطباعة أو الحفظ كـ PDF من نافذة المتصفح */
export function buildCollegeRoomReportHtml(
  row: CollegeExamRoomRow,
  hints: CollegeRoomScheduleHint[],
  generatedLabel: string
): string {
  const e = escapeHtml;
  const dual = Boolean(row.study_subject_id_2);

  const inv1 = splitLines(row.invigilators).map((n) => `<li>${e(n)}</li>`).join("");

  const abs1 = splitLines(row.absence_names).map((n) => `<li>${e(n)}</li>`).join("");
  const abs2 = splitLines(row.absence_names_2).map((n) => `<li>${e(n)}</li>`).join("");

  const scheduleRows =
    hints.length > 0
      ? hints
          .map(
            (h) =>
              `<tr><td>${e(h.exam_date)}</td><td>${e(h.start_time)}</td><td>${e(h.end_time)}</td><td>${e(h.study_subject_name)}</td></tr>`
          )
          .join("")
      : `<tr><td colspan="4" style="text-align:center;color:#64748b">لا توجد جداول مرتبطة بهذه القاعة في النظام.</td></tr>`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${e(row.room_name)} — تقرير قاعة</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; margin: 0; padding: 12mm; color: #0f172a; font-size: 11pt; line-height: 1.55; }
    @page { size: A4; margin: 14mm; }
    h1 { font-size: 17pt; text-align: center; margin: 0 0 6mm; border-bottom: 2px solid #1e3a8a; padding-bottom: 4mm; color: #1e3a8a; }
    .sub { text-align: center; font-size: 10pt; color: #475569; margin-bottom: 8mm; }
    h2 { font-size: 12pt; color: #1e3a8a; margin: 5mm 0 2mm; border-right: 4px solid #2563eb; padding-right: 8px; }
    table.data { width: 100%; border-collapse: collapse; margin: 2mm 0 5mm; font-size: 10.5pt; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: right; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; color: #334155; }
    .muted { color: #64748b; font-size: 9.5pt; }
    ul.compact { margin: 2mm 0; padding-right: 18px; }
    .footer { margin-top: 10mm; padding-top: 4mm; border-top: 1px solid #e2e8f0; font-size: 9pt; color: #64748b; text-align: center; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9pt; font-weight: 700; }
    .badge-dual { background: #fef3c7; color: #b45309; }
    .badge-single { background: #e2e8f0; color: #475569; }
  </style>
</head>
<body>
  <h1>تقرير رسمي — بيانات القاعة الامتحانية</h1>
  <p class="sub">وثيقة مولَّدة آلياً من نظام إدارة الاختبارات — ${e(generatedLabel)}</p>

  <h2>1. تعريف القاعة</h2>
  <table class="data">
    <tr><th style="width:28%">اسم القاعة</th><td><strong>${e(row.room_name)}</strong></td></tr>
    <tr><th>التسلسل في السجلات</th><td>${row.serial_no}</td></tr>
    <tr><th>وضع الاستخدام</th><td>${
      dual
        ? `<span class="badge badge-dual">قاعة بامتحانين متزامنين</span>`
        : `<span class="badge badge-single">قاعة بامتحان واحد</span>`
    }</td></tr>
  </table>

  <h2>2. الامتحان الأول والطلبة المسجَّلين</h2>
  <table class="data">
    <tr><th>المادة الامتحانية</th><td>${e(row.study_subject_name)} <span class="muted">(معرّف ${e(row.study_subject_id)})</span></td></tr>
    <tr><th>المرحلة الدراسية</th><td>المرحلة ${row.stage_level ?? 1}</td></tr>
    <tr><th>المشرف</th><td>${e(row.supervisor_name)}</td></tr>
    <tr><th>المراقبون</th><td>${
      inv1 ? `<ul class="compact">${inv1}</ul>` : "—"
    }</td></tr>
    <tr><th>السعة — صباحي</th><td>${row.capacity_morning}</td></tr>
    <tr><th>السعة — مسائي</th><td>${row.capacity_evening}</td></tr>
    <tr><th>السعة الإجمالية (المسموح به)</th><td><strong>${row.capacity_total}</strong></td></tr>
    <tr><th>الحضور الفعلي</th><td>${row.attendance_count}</td></tr>
    <tr><th>الغياب (عدد)</th><td>${row.absence_count}</td></tr>
    <tr><th>أسماء الغياب</th><td>${
      abs1 ? `<ul class="compact">${abs1}</ul>` : `<span class="muted">لا يوجد</span>`
    }</td></tr>
  </table>

  ${
    dual && row.study_subject_name_2
      ? `<h2>3. الامتحان الثاني والطلبة المسجَّلين</h2>
  <table class="data">
    <tr><th>المادة الامتحانية</th><td>${e(row.study_subject_name_2)} <span class="muted">(معرّف ${e(row.study_subject_id_2 ?? "")})</span></td></tr>
    <tr><th>المرحلة الدراسية</th><td>المرحلة ${row.stage_level_2 ?? row.stage_level ?? 1}</td></tr>
    <tr><th>المشرف</th><td>${e(row.supervisor_name)} <span class="muted">(مشرف القاعة — مشترك)</span></td></tr>
    <tr><th>المراقبون</th><td>${
      inv1 ? `<ul class="compact">${inv1}</ul>` : "—"
    } <span class="muted">(نفس قائمة مراقبي القاعة)</span></td></tr>
    <tr><th>السعة — صباحي</th><td>${row.capacity_morning_2}</td></tr>
    <tr><th>السعة — مسائي</th><td>${row.capacity_evening_2}</td></tr>
    <tr><th>السعة الإجمالية (المسموح به)</th><td><strong>${row.capacity_total_2}</strong></td></tr>
    <tr><th>الحضور الفعلي</th><td>${row.attendance_count_2}</td></tr>
    <tr><th>الغياب (عدد)</th><td>${row.absence_count_2}</td></tr>
    <tr><th>أسماء الغياب</th><td>${
      abs2 ? `<ul class="compact">${abs2}</ul>` : `<span class="muted">لا يوجد</span>`
    }</td></tr>
  </table>`
      : ""
  }

  <h2>${dual ? "4" : "3"}. الجداول الامتحانية المرتبطة بهذه القاعة</h2>
  <p class="muted" style="margin:0 0 3mm">يُستخرج من «الجداول الامتحانية» — يُرجى التأكد من مطابقة التاريخ والوقت بين المواد في القاعة المزدوجة.</p>
  <table class="data">
    <thead><tr><th>التاريخ</th><th>من</th><th>إلى</th><th>المادة</th></tr></thead>
    <tbody>${scheduleRows}</tbody>
  </table>

  <h2>${dual ? "5" : "4"}. بيانات تقنية للسجل</h2>
  <table class="data">
    <tr><th>معرّف القاعة</th><td>${e(row.id)}</td></tr>
    <tr><th>آخر تحديث</th><td>${e(row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at))}</td></tr>
  </table>

  <div class="footer">
    هذا التقرير صادر عن النظام ولا يغني عن التوقيعات الرسمية عند الاقتضاء — يمكن طباعته أو حفظه كملف PDF من نافذة الطباعة في المتصفح («حفظ كـ PDF»).
  </div>
</body>
</html>`;
}
