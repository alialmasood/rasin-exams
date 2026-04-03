/** صف جلسة واحدة للتصدير (يوم واحد أو عدة أيام) */
export type ParticipationExcelRow = {
  "#": number;
  التاريخ: string;
  اليوم: string;
  المادة: string;
  مرحلة: number;
  الوقت: string;
  المدة: string;
  القاعة: string;
  مقاعد: number;
  حضور: number;
  غياب: number;
  "أسماء الغائبين": string;
  نوع: string;
  "عام دراسي": string;
  فصل: string;
  "حالة الجدول": string;
  "عدد قاعات الجلسة": number;
};

export type ParticipationExcelDeptBlock = {
  deptName: string;
  rows: ParticipationExcelRow[];
};

export type ParticipationExcelInput = {
  formationLabel: string;
  ownerUsername: string;
  /** يظهر في اسم الملف (مثلاً تاريخ يوم أو «كل-الأيام») */
  scopeSlug: string;
  departments: ParticipationExcelDeptBlock[];
};

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

function safeFilenamePart(s: string, max: number): string {
  return s.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_").trim().slice(0, max) || "export";
}

/** ارتفاع صف أوضح بدرجة واحدة تقريباً عن الافتراضي في Excel (~15pt) */
const EXCEL_ROW_HPT = 17;

function applyLargerRowHeights(ws: import("xlsx").WorkSheet, xlsx: typeof import("xlsx")) {
  const ref = ws["!ref"];
  if (!ref) return;
  const range = xlsx.utils.decode_range(ref);
  const rows: import("xlsx").RowInfo[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    rows[r] = { hpt: EXCEL_ROW_HPT };
  }
  ws["!rows"] = rows;
}

/**
 * تصدير Excel لمشاركة الطلبة: ورقة لكل قسم/فرع، مع صفوف مرتبة حسب التاريخ ثم الوقت.
 */
export async function exportParticipationExcel(input: ParticipationExcelInput): Promise<void> {
  const xlsx = await import("xlsx");
  const wb = xlsx.utils.book_new();
  const usedNames = new Set<string>();

  if (input.departments.length === 0) {
    const ws = xlsx.utils.aoa_to_sheet([["لا توجد بيانات في نطاق التصدير المختار"]]);
    applyLargerRowHeights(ws, xlsx);
    xlsx.utils.book_append_sheet(wb, ws, "تقرير");
    const base = safeFilenamePart(`${input.formationLabel}-${input.scopeSlug}`, 100);
    xlsx.writeFile(wb, `musharaka-${base}.xlsx`);
    return;
  }

  for (const d of input.departments) {
    const sheetName = excelSheetNameSafe(d.deptName, usedNames);
    const ws = xlsx.utils.json_to_sheet(
      d.rows.length ? d.rows : [{ ملاحظة: "لا توجد جلسات في هذا القسم ضمن النطاق" }]
    );
    applyLargerRowHeights(ws, xlsx);
    xlsx.utils.book_append_sheet(wb, ws, sheetName);
  }

  const fileBase = safeFilenamePart(`${input.formationLabel}-${input.ownerUsername}-${input.scopeSlug}`, 120);
  xlsx.writeFile(wb, `musharaka-${fileBase}.xlsx`);
}

/** مدخلات الطباعة / PDF: نفس بيانات Excel مع عنوان النطاق بالعربية للتقرير الرسمي */
export type ParticipationReportPrintInput = ParticipationExcelInput & {
  scopeTitleAr: string;
};

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function participationExportNowLabel(): string {
  return new Intl.DateTimeFormat("ar-IQ", {
    timeZone: "Asia/Baghdad",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
}

/**
 * تقرير HTML رسمي لمشاركة الطلبة — مُحسَّن للطباعة أو «حفظ كـ PDF»، ورق A4 أفقي (عرضي) لاستيعاب الجدول كاملاً.
 */
export function buildParticipationReportPrintHtml(
  input: ParticipationReportPrintInput,
  generatedLabel: string
): string {
  const e = escapeHtml;
  const logoSrc = "/uob-logo.png";

  const deptSections =
    input.departments.length === 0
      ? `<p class="muted empty-msg">لا توجد بيانات في نطاق التقرير المحدد.</p>`
      : input.departments
          .map((d) => {
            const rows = d.rows
              .map((r) => {
                const termYear =
                  [r["عام دراسي"], r["فصل"]].filter((x) => x && String(x).trim() && x !== "—").join(" · ") || "—";
                return `<tr>
            <td class="num">${r["#"]}</td>
            <td class="num">${e(r.التاريخ)}</td>
            <td class="compact">${e(r.اليوم)}</td>
            <td class="subj">${e(r.المادة)}</td>
            <td class="num">${r.مرحلة}</td>
            <td class="num nowrap">${e(r.الوقت)}</td>
            <td class="num nowrap">${e(r.المدة)}</td>
            <td class="room">${e(r.القاعة)}</td>
            <td class="num">${r.مقاعد}</td>
            <td class="num pres">${r.حضور}</td>
            <td class="num abs">${r.غياب}</td>
            <td class="abs-names">${e(r["أسماء الغائبين"])}</td>
            <td class="compact">${e(r.نوع)}</td>
            <td class="yr">${e(termYear)}</td>
            <td class="compact">${e(r["حالة الجدول"])}</td>
          </tr>`;
              })
              .join("");

            return `<section class="dept-block">
        <h2>القسم / الفرع: ${e(d.deptName)}</h2>
        <p class="dept-meta">${d.rows.length} جلسة — بيانات المقاعد والحضور والغياب</p>
        <table class="data">
          <thead>
            <tr>
              <th>#</th>
              <th>التاريخ</th>
              <th>اليوم</th>
              <th>المادة</th>
              <th>مرحلة</th>
              <th>الوقت</th>
              <th>المدة</th>
              <th>القاعة</th>
              <th>مقاعد</th>
              <th>حضور</th>
              <th>غياب</th>
              <th>أسماء الغائبين</th>
              <th>نوع الامتحان</th>
              <th>عام / فصل</th>
              <th>حالة الجدول</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="15" class="muted">لا توجد صفوف</td></tr>`}</tbody>
        </table>
      </section>`;
          })
          .join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير مشاركة الطلبة — ${e(input.formationLabel)}</title>
  <style>
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: 'Segoe UI', 'Noto Naskh Arabic', Tahoma, Arial, sans-serif;
      margin: 0;
      padding: 8mm 10mm 10mm;
      color: #0f172a;
      font-size: 10pt;
      line-height: 1.4;
    }
    @page {
      size: A4 landscape;
      margin: 8mm;
    }
    .report-brand {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 10px;
      margin: 0 0 3mm;
      padding-bottom: 3mm;
      border-bottom: 2px solid #1e3a8a;
    }
    .report-brand-side { font-size: 11pt; font-weight: 800; color: #1e3a8a; }
    .report-brand-college-side { text-align: left; }
    .report-brand-uni-side { text-align: right; }
    .report-brand-logo { height: 52px; width: auto; max-width: 90px; object-fit: contain; }
    h1 {
      font-size: 14pt;
      text-align: center;
      margin: 0 0 1mm;
      color: #1e3a8a;
      font-weight: 800;
      padding-bottom: 2mm;
      border-bottom: 1px solid #cbd5e1;
    }
    .sub { text-align: center; font-size: 9.8pt; color: #475569; margin: 2mm 0 3mm; line-height: 1.5; }
    .scope { display: block; margin-top: 1mm; font-weight: 700; color: #334155; }
    .mono { font-family: Consolas, ui-monospace, monospace; font-size: 9.2pt; }
    h2 {
      font-size: 11.5pt;
      color: #1e3a8a;
      margin: 4mm 0 1.5mm;
      padding-right: 8px;
      border-right: 4px solid #2563eb;
      page-break-after: avoid;
    }
    .dept-meta { font-size: 9pt; color: #64748b; margin: 0 0 2mm; }
    .dept-block { page-break-inside: auto; margin-bottom: 5mm; }
    table.data { width: 100%; border-collapse: collapse; margin: 1mm 0; font-size: 8pt; table-layout: fixed; }
    th, td {
      border: 1px solid #94a3b8;
      padding: 2px 4px;
      text-align: right;
      vertical-align: top;
      word-wrap: break-word;
    }
    th {
      background: #e2e8f0;
      font-weight: 800;
      color: #1e293b;
      font-size: 8.2pt;
    }
    td.num { text-align: center; font-variant-numeric: tabular-nums; }
    td.compact { font-size: 7.8pt; }
    td.nowrap { white-space: nowrap; }
    td.subj { font-weight: 700; font-size: 8.1pt; }
    td.room { font-size: 7.8pt; }
    td.pres { color: #065f46; font-weight: 700; }
    td.abs { color: #92400e; font-weight: 700; }
    td.abs-names { font-size: 7.5pt; line-height: 1.35; color: #334155; }
    td.yr { font-size: 7.8pt; }
    .muted { color: #64748b; text-align: center; }
    .empty-msg { padding: 10mm; font-size: 11pt; }
    .footer {
      margin-top: 4mm;
      padding-top: 2mm;
      border-top: 1px solid #cbd5e1;
      font-size: 8.8pt;
      color: #64748b;
      text-align: center;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="report-brand" dir="ltr">
    <div class="report-brand-side report-brand-college-side">تقرير مشاركة الطلبة في الامتحان</div>
    <div style="text-align:center"><img class="report-brand-logo" src="${e(logoSrc)}" alt="" /></div>
    <div class="report-brand-side report-brand-uni-side">جامعة البصرة</div>
  </div>
  <h1>مشاركة الطلبة في الامتحان — ${e(input.formationLabel)}</h1>
  <p class="sub">
    حساب التشكيل: <span class="mono">@${e(input.ownerUsername)}</span>
    <span class="scope">${e(input.scopeTitleAr)}</span>
    <br />
    صدور التقرير: <span class="mono">${e(generatedLabel)}</span>
  </p>
  ${deptSections}
  <div class="footer">
    ورق بحجم A4 (وضع أفقي / عرضي) — يُحفظ كملف PDF من نافذة الطباعة عند اختيار «حفظ كـ PDF» أو الطابعة المناسبة.
  </div>
</body>
</html>`;
}

/** فتح نافذة طباعة للحفظ كـ PDF (تقرير رسمي A4 أفقي) */
export function printParticipationReportHtml(html: string): boolean {
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
      window.setTimeout(runPrint, 200);
    } else {
      w.addEventListener("load", () => window.setTimeout(runPrint, 200), { once: true });
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
