import type { ExamSituationDetail } from "@/lib/college-exam-situations";

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

const SCHEDULE_TYPE_AR: Record<ExamSituationDetail["schedule_type"], string> = {
  FINAL: "جدول امتحانات نهائية",
  SEMESTER: "جدول امتحانات فصلية",
};

const WORKFLOW_AR: Record<ExamSituationDetail["workflow_status"], string> = {
  DRAFT: "مسودة",
  SUBMITTED: "مرفوع للمتابعة",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
};

const STUDY_TYPE_AR: Record<ExamSituationDetail["study_type"], string> = {
  ANNUAL: "سنوي",
  SEMESTER: "فصلي",
  COURSES: "بالمقررات",
  BOLOGNA: "بولونيا",
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

/**
 * طباعة / PDF — A4، تقرير حكومي، صفحتان (1: كلية+مادة، 2: موعد+حضور+اعتماد).
 * جميع البيانات محفوظة؛ التنسيق فقط.
 */
export function buildExamSituationReportHtml(
  detail: ExamSituationDetail,
  collegeLabel: string,
  deanName: string,
  generatedLabel: string
): string {
  const e = escapeHtml;
  const invList = splitLines(detail.invigilators).map((n) => `<li>${e(n)}</li>`).join("");
  const absList = splitLines(detail.absence_names).map((n) => `<li>${e(n)}</li>`).join("");
  const sumAttAbs = detail.attendance_count + detail.absence_count;

  const notesBlock =
    detail.notes && detail.notes.trim().length > 0
      ? `<p class="notes-pre">${e(detail.notes.trim())}</p>`
      : `<span class="muted">لا توجد</span>`;

  const deanApprovedYesNo = detail.dean_status === "APPROVED" ? "نعم" : "لا";
  const invigilatorsCell = invList ? `<ul class="list-dot">${invList}</ul>` : "—";

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
      display: table;
      width: 100%;
      border-bottom: 2px solid #1e3a8a;
      padding: 6px 0 10px;
      margin-bottom: 10px;
    }
    .report-header-row { display: table-row; }
    .report-header-cell { display: table-cell; vertical-align: middle; padding: 4px 6px; font-size: 13px; }
    .hdr-right { width: 32%; text-align: right; font-weight: 700; line-height: 1.45; }
    .hdr-right .uni { font-size: 14px; color: #1e3a8a; }
    .hdr-right .college { font-weight: 600; color: #374151; margin-top: 2px; }
    .hdr-center {
      width: 36%;
      text-align: center;
      font-size: 18px;
      font-weight: 800;
      color: #1e3a8a;
      padding-inline: 6px;
    }
    .hdr-left { width: 32%; text-align: left; direction: rtl; font-size: 13px; color: #374151; line-height: 1.55; }
    .hdr-left .meta-line { margin: 1px 0; }

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
    <div class="report-header-row">
      <div class="report-header-cell hdr-right">
        <div class="uni">جامعة البصرة</div>
        <div class="college">${e(collegeLabel)}</div>
      </div>
      <div class="report-header-cell hdr-center">تقرير رسمي — الموقف الامتحاني</div>
      <div class="report-header-cell hdr-left">
        <div class="meta-line"><strong>التاريخ:</strong> ${e(generatedLabel)}</div>
        <div class="meta-line"><strong>رقم التقرير:</strong> ${e(detail.schedule_id)}</div>
      </div>
    </div>
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
        ${row2("معرّف المادة الدراسية في النظام", `<span class="muted">${e(detail.study_subject_id)}</span>`)}
        ${row2("المرحلة الدراسية", `المرحلة ${detail.stage_level}`)}
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
          <td>${e(detail.supervisor_name)}</td>
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
        <tr><td>السعة (عدد المقاعد المعتمد للمادة في هذه القاعة)</td><td><strong>${detail.capacity_total}</strong></td></tr>
        <tr><td>الحضور</td><td>${detail.attendance_count}</td></tr>
        <tr><td>الغياب</td><td>${detail.absence_count}</td></tr>
        <tr><td>المجموع (حضور + غياب)</td><td>${sumAttAbs}</td></tr>
        <tr><td>اكتمال البيانات (مطابقة السعة وأسماء الغياب عند الحاجة)</td><td>${detail.is_complete ? "مكتمل" : "غير مكتمل"}</td></tr>
      </table>
      <table class="table" style="margin-top:8px;">
        ${row2("أسماء الطلبة الغائبين", absList ? `<ul class="list-dot">${absList}</ul>` : `<span class="muted">لا يوجد / لم يُدرج</span>`)}
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
