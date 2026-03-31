import type { CollegeAccountRow } from "@/lib/college-accounts";

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

function statusLabelAr(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "نشط";
    case "DISABLED":
      return "معطل";
    case "LOCKED":
      return "مقفل";
    case "PENDING":
      return "قيد المراجعة";
    default:
      return status;
  }
}

function accountKindLabelAr(row: CollegeAccountRow): string {
  return row.account_kind === "FOLLOWUP" ? "حساب متابعة" : "حساب تشكيل";
}

function formationDisplay(row: CollegeAccountRow): string {
  if (row.account_kind === "FOLLOWUP") return "—";
  return (row.formation_name ?? "—").trim() || "—";
}

function deanOrHolder(row: CollegeAccountRow): string {
  return row.account_kind === "FOLLOWUP" ? (row.holder_name ?? "—") : (row.dean_name ?? "—");
}

export type CollegeAccountsReportInput = {
  rows: CollegeAccountRow[];
  generatedLabel: string;
  assetsBaseUrl: string;
};

export function buildCollegeAccountsReportHtml(input: CollegeAccountsReportInput): string {
  const e = escapeHtml;
  const { rows, generatedLabel, assetsBaseUrl } = input;
  const base = (assetsBaseUrl ?? "").replace(/\/$/, "");
  const logoSrc = base ? `${base}/uob-logo.png` : "/uob-logo.png";

  let formation = 0;
  let followup = 0;
  let active = 0;
  let disabled = 0;
  let locked = 0;
  let pending = 0;
  for (const r of rows) {
    if (r.account_kind === "FOLLOWUP") followup += 1;
    else formation += 1;
    switch (r.status) {
      case "ACTIVE":
        active += 1;
        break;
      case "DISABLED":
        disabled += 1;
        break;
      case "LOCKED":
        locked += 1;
        break;
      case "PENDING":
        pending += 1;
        break;
      default:
        break;
    }
  }
  const total = rows.length;
  const activeRate = total > 0 ? Math.round((active / total) * 100) : 0;

  const tableRows = rows
    .map((row, index) => {
      return `<tr>
        <td>${index + 1}</td>
        <td>${e(accountKindLabelAr(row))}</td>
        <td><strong>${e(formationDisplay(row))}</strong></td>
        <td>${e(deanOrHolder(row))}</td>
        <td style="font-family:Consolas,monospace;font-size:9pt">${e(row.username)}</td>
        <td>${e(statusLabelAr(row.status))}</td>
        <td>${e(formatDateTimeAr(row.created_at))}</td>
        <td style="font-size:8.5pt;color:#475569">${e(row.id)}</td>
      </tr>`;
    })
    .join("");

  const emptyRow =
    rows.length === 0
      ? `<tr><td colspan="8" style="text-align:center;color:#64748b;padding:10mm">لا توجد حسابات مسجّلة.</td></tr>`
      : "";

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير حسابات التشكيلات — جامعة البصرة</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Noto Naskh Arabic', Tahoma, Arial, sans-serif; margin: 0; padding: 12mm; color: #0f172a; font-size: 10.5pt; line-height: 1.55; }
    @page { size: A4; margin: 14mm; }
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
    h1 { font-size: 16pt; text-align: center; margin: 0 0 4mm; border-bottom: 2px solid #1e3a8a; padding-bottom: 4mm; color: #1e3a8a; }
    .sub { text-align: center; font-size: 10pt; color: #475569; margin-bottom: 2mm; }
    h2 { font-size: 12pt; color: #1e3a8a; margin: 6mm 0 3mm; border-right: 4px solid #2563eb; padding-right: 8px; page-break-after: avoid; }
    table.data { width: 100%; border-collapse: collapse; margin: 2mm 0 5mm; font-size: 9.5pt; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: right; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; color: #334155; }
    .summary { display: table; width: 100%; border-collapse: collapse; margin-bottom: 5mm; font-size: 10pt; }
    .summary-row { display: table-row; }
    .summary-cell { display: table-cell; border: 1px solid #e2e8f0; padding: 8px 10px; width: 16.66%; text-align: center; background: #f8fafc; }
    .summary-val { font-size: 13pt; font-weight: 800; color: #1e3a8a; }
    .muted { color: #64748b; font-size: 9pt; }
    .footer { margin-top: 8mm; padding-top: 4mm; border-top: 1px solid #e2e8f0; font-size: 9pt; color: #64748b; text-align: center; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="report-brand" dir="ltr">
    <div class="report-brand-side report-brand-college-side">إدارة حسابات التشكيلات</div>
    <div class="report-brand-logo-wrap">
      <img class="report-brand-logo" src="${e(logoSrc)}" width="100" height="100" alt="" />
    </div>
    <div class="report-brand-side report-brand-uni-side">جامعة البصرة</div>
  </div>
  <h1>تقرير رسمي — جدول حسابات التشكيلات وأنواعها وتفاصيلها</h1>
  <p class="sub">نظام رصين لإدارة الامتحانات — بوابة المشرف العام</p>
  <p class="sub muted" style="margin-bottom:6mm">تاريخ ووقت إصدار التقرير: ${e(generatedLabel)}</p>

  <h2>1. ملخص إحصائي</h2>
  <div class="summary">
    <div class="summary-row">
      <div class="summary-cell"><span class="muted">إجمالي الحسابات</span><div class="summary-val">${total}</div></div>
      <div class="summary-cell"><span class="muted">حسابات تشكيل</span><div class="summary-val">${formation}</div></div>
      <div class="summary-cell"><span class="muted">حسابات متابعة</span><div class="summary-val">${followup}</div></div>
      <div class="summary-cell"><span class="muted">نشط / معطل</span><div class="summary-val" style="font-size:11pt">${active} / ${disabled}</div></div>
      <div class="summary-cell"><span class="muted">مقفل / قيد المراجعة</span><div class="summary-val" style="font-size:11pt">${locked} / ${pending}</div></div>
      <div class="summary-cell"><span class="muted">نسبة النشط</span><div class="summary-val">${activeRate}%</div></div>
    </div>
  </div>

  <h2>2. جدول تفصيلي لجميع الحسابات</h2>
  <p class="muted" style="margin:0 0 3mm">لا تُعرض كلمات المرور. عمود المعرف للمراجعة الإدارية وقواعد البيانات.</p>
  <table class="data">
    <thead>
      <tr>
        <th>#</th>
        <th>نوع الحساب</th>
        <th>اسم التشكيل</th>
        <th>عميد الكلية / صاحب الحساب</th>
        <th>اسم المستخدم</th>
        <th>الحالة</th>
        <th>تاريخ الإنشاء</th>
        <th>معرّف السجل</th>
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

export function printCollegeAccountsReportHtml(html: string): boolean {
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
