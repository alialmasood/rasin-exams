import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { CollegeExamScheduleRow, ScheduleType } from "@/lib/college-exam-schedules";
import { groupExamScheduleRowsIntoSessions } from "@/lib/exam-schedule-logical-group";

const SCHEDULE_SHORT: Record<ScheduleType, string> = {
  FINAL: "نهائي",
  SEMESTER: "فصلي",
};

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function weekdayAr(dateIso: string) {
  if (!dateIso) return "";
  return new Intl.DateTimeFormat("ar-IQ", { weekday: "long" }).format(new Date(dateIso));
}

function timeRangeLabel(start: string, end: string) {
  return `${start || "--:--"} - ${end || "--:--"}`;
}

function formatDuration(minutes: number) {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} ساعة و${m} دقيقة`;
  if (h > 0) return h === 1 ? "ساعة واحدة" : `${h} ساعات`;
  return `${m} دقيقة`;
}

function sortRows(rows: CollegeExamScheduleRow[]) {
  return [...rows].sort((a, b) => {
    const da = `${a.exam_date} ${a.start_time}`;
    const db = `${b.exam_date} ${b.start_time}`;
    return da.localeCompare(db);
  });
}

/** صف واحد لكل جلسة منطقية؛ عمود القاعة يجمع كل القاعات المرتبطة بنفس المادة والوقت. */
function mergeScheduleRowsForOfficialTable(sortedRows: CollegeExamScheduleRow[]): CollegeExamScheduleRow[] {
  const sessions = groupExamScheduleRowsIntoSessions(sortedRows);
  return sessions.map((members) => {
    const base = members[0]!;
    return {
      ...base,
      room_name: members.map((m) => m.room_name.trim() || "—").join(" · "),
    };
  });
}

const PDF_AR_FONT_FAMILY = "'Noto Naskh Arabic', 'Segoe UI', Tahoma, sans-serif";

/** خط عربي بربط صحيح للحروف قبل html2canvas */
async function ensureArabicPdfFont(): Promise<void> {
  const sel = 'link[data-examsuob-pdf-font="noto-naskh-arabic"]';
  if (!document.querySelector(sel)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.setAttribute("data-examsuob-pdf-font", "noto-naskh-arabic");
    link.href = "https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@500;600;700&display=swap";
    document.head.appendChild(link);
  }
  try {
    await document.fonts.load("700 20px 'Noto Naskh Arabic'");
    await document.fonts.load("600 11px 'Noto Naskh Arabic'");
  } catch {
    /* حتى يُسجَّل الخط من الـ stylesheet */
  }
  await document.fonts.ready;
}

export type ScheduleGroupDocArgs = {
  collegeLabel: string;
  departmentName: string;
  rows: CollegeExamScheduleRow[];
};

function buildScheduleGroupDocumentHtml(args: {
  collegeLabel: string;
  departmentName: string;
  sortedRows: CollegeExamScheduleRow[];
  issued: string;
  ay: string;
  termDisplay: string;
}): string {
  const { collegeLabel, departmentName, sortedRows, issued, ay, termDisplay } = args;

  const tableRows = sortedRows
    .map((r, i) => {
      const type = SCHEDULE_SHORT[r.schedule_type] ?? r.schedule_type;
      return `<tr>
        <td style="padding:7px 5px;border:1px solid #94a3b8;text-align:center;vertical-align:middle">${i + 1}</td>
        <td style="padding:7px 8px;border:1px solid #94a3b8;text-align:right;vertical-align:middle;font-weight:600;color:#0f172a;word-wrap:break-word;overflow-wrap:break-word">${escHtml(r.study_subject_name)}</td>
        <td style="padding:7px 5px;border:1px solid #94a3b8;text-align:center;vertical-align:middle">${r.stage_level}</td>
        <td style="padding:7px 5px;border:1px solid #94a3b8;text-align:center;vertical-align:middle">${escHtml(type)}</td>
        <td style="padding:7px 5px;border:1px solid #94a3b8;text-align:center;vertical-align:middle;white-space:nowrap;direction:ltr;font-variant-numeric:tabular-nums">${escHtml(r.exam_date)}</td>
        <td style="padding:7px 7px;border:1px solid #94a3b8;text-align:right;vertical-align:middle">${escHtml(weekdayAr(r.exam_date))}</td>
        <td style="padding:7px 5px;border:1px solid #94a3b8;text-align:center;vertical-align:middle;white-space:nowrap;direction:ltr;font-variant-numeric:tabular-nums">${escHtml(timeRangeLabel(r.start_time, r.end_time))}</td>
        <td style="padding:7px 5px;border:1px solid #94a3b8;text-align:center;vertical-align:middle">${escHtml(formatDuration(r.duration_minutes))}</td>
        <td style="padding:7px 8px;border:1px solid #94a3b8;text-align:right;vertical-align:middle">${escHtml(r.room_name)}</td>
      </tr>`;
    })
    .join("");

  return `
    <div style="border:2px solid #1f3578;border-radius:4px;overflow:hidden;box-shadow:0 1px 0 rgba(15,23,42,0.06);">
      <div style="background:linear-gradient(180deg,#274092 0%,#1f3578 100%);color:#fff;padding:18px 22px 20px;text-align:center;">
        <div style="font-family:${PDF_AR_FONT_FAMILY};font-size:19px;font-weight:700;letter-spacing:0;line-height:1.45;">جدول الامتحانات</div>
        <div style="margin-top:12px;font-family:${PDF_AR_FONT_FAMILY};font-size:12px;font-weight:600;line-height:1.6;opacity:0.95;">
          <span style="white-space:nowrap">العام الدراسي: ${escHtml(ay)}</span>
          <span style="margin:0 10px;opacity:0.65">|</span>
          <span style="white-space:nowrap">الفصل الدراسي: ${escHtml(termDisplay)}</span>
        </div>
      </div>
      <div style="padding:16px 22px 20px;background:#fafbfd;">
        <div style="font-family:${PDF_AR_FONT_FAMILY};font-size:11px;font-weight:700;color:#0f172a;text-align:right;line-height:1.6;margin-bottom:14px;border-bottom:1px solid #e2e8f0;padding-bottom:12px;">
          <span style="color:#475569;font-weight:600">الكلية:</span>
          ${escHtml(collegeLabel)}
          <span style="margin:0 12px;color:#cbd5e1;font-weight:400">|</span>
          <span style="color:#475569;font-weight:600">القسم / الفرع:</span>
          ${escHtml(departmentName)}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:9.5px;table-layout:fixed;">
          <colgroup>
            <col style="width:4%">
            <col style="width:20%">
            <col style="width:6%">
            <col style="width:7%">
            <col style="width:9%">
            <col style="width:12%">
            <col style="width:14%">
            <col style="width:10%">
            <col style="width:18%">
          </colgroup>
          <thead>
            <tr style="background:#e2e8f0;color:#0f172a;">
              <th style="padding:9px 5px;border:1px solid #64748b;font-weight:800">ت</th>
              <th style="padding:9px 8px;border:1px solid #64748b;font-weight:800;text-align:right">المادة الامتحانية</th>
              <th style="padding:9px 5px;border:1px solid #64748b;font-weight:800">المرحلة</th>
              <th style="padding:9px 5px;border:1px solid #64748b;font-weight:800">النوع</th>
              <th style="padding:9px 5px;border:1px solid #64748b;font-weight:800">التاريخ</th>
              <th style="padding:9px 5px;border:1px solid #64748b;font-weight:800">اليوم</th>
              <th style="padding:9px 5px;border:1px solid #64748b;font-weight:800">وقت الامتحان</th>
              <th style="padding:9px 5px;border:1px solid #64748b;font-weight:800">المدة</th>
              <th style="padding:9px 6px;border:1px solid #64748b;font-weight:800;text-align:right">القاعة</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div style="margin-top:18px;padding-top:14px;border-top:1px solid #cbd5e1;font-family:${PDF_AR_FONT_FAMILY};font-size:8.5px;color:#64748b;text-align:center;line-height:1.75;">
          <div>صادر عن نظام إدارة الجداول الامتحانية</div>
          <div style="margin-top:6px;font-weight:600;color:#475569;">تاريخ إعداد الوثيقة: ${escHtml(issued)}</div>
        </div>
      </div>
    </div>
  `;
}

function fileSlug(departmentName: string) {
  return (
    departmentName
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 48) || "department"
  );
}

async function captureScheduleGroupCanvas(args: ScheduleGroupDocArgs): Promise<HTMLCanvasElement> {
  const { collegeLabel, departmentName, rows } = args;
  if (rows.length === 0) throw new Error("لا توجد بيانات للتصدير.");

  await ensureArabicPdfFont();

  const first = rows[0];
  const ay = (first.academic_year ?? "").trim() || "—";
  const termRaw = (first.term_label ?? "").trim();
  const termDisplay = termRaw || "—";
  const issued = new Intl.DateTimeFormat("ar-IQ", { dateStyle: "long" }).format(new Date());
  const sorted = mergeScheduleRowsForOfficialTable(sortRows(rows));

  const host = document.createElement("div");
  host.setAttribute("dir", "rtl");
  host.setAttribute("lang", "ar");
  host.style.cssText = [
    "position:fixed",
    "left:-14000px",
    "top:0",
    "width:794px",
    "padding:24px 28px",
    "background:#ffffff",
    "color:#0f172a",
    `font-family:${PDF_AR_FONT_FAMILY}`,
    "font-size:11px",
    "line-height:1.5",
    "box-sizing:border-box",
  ].join(";");

  host.innerHTML = buildScheduleGroupDocumentHtml({
    collegeLabel,
    departmentName,
    sortedRows: sorted,
    issued,
    ay,
    termDisplay,
  });

  document.body.appendChild(host);
  try {
    return await html2canvas(host, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 794,
    });
  } finally {
    document.body.removeChild(host);
  }
}

function canvasToPdfBlob(canvas: HTMLCanvasElement): Blob {
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 9;
  const contentWidth = pageWidth - 2 * margin;
  const pageInnerHeight = pageHeight - 2 * margin;

  const imgWidthMm = contentWidth;
  const totalImgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

  let yPx = 0;
  let firstPage = true;

  while (yPx < canvas.height) {
    if (!firstPage) pdf.addPage();
    firstPage = false;

    const sliceHeightPx = Math.max(
      1,
      Math.min(
        canvas.height - yPx,
        Math.floor((pageInnerHeight / totalImgHeightMm) * canvas.height)
      )
    );

    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeightPx;
    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(canvas, 0, yPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

    const sliceHeightMm = (sliceHeightPx / canvas.height) * totalImgHeightMm;
    pdf.addImage(sliceCanvas.toDataURL("image/jpeg", 0.93), "JPEG", margin, margin, imgWidthMm, sliceHeightMm);

    yPx += sliceHeightPx;
  }

  return pdf.output("blob");
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("تعذر إنشاء الصورة."));
      },
      "image/png",
      0.95
    );
  });
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function buildScheduleGroupWhatsAppCaption(collegeLabel: string, departmentName: string): string {
  return [
    "📋 *جدول الامتحانات — وثيقة رسمية*",
    "",
    `الكلية: ${collegeLabel}`,
    `القسم / الفرع: ${departmentName}`,
  ].join("\n");
}

export type ShareScheduleResult = "shared_pdf" | "shared_png" | "downloaded_pdf" | "cancelled";

function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * مشاركة الجدول الرسمي عبر واتساب عندما يدعم المتصفح إرفاق ملف (Web Share API).
 * وإلا: تنزيل PDF وفتح واتساب برسالة نصية يطلب من المستخدم إرفاق الملف يدوياً.
 */
export async function shareCollegeScheduleGroupForWhatsApp(args: ScheduleGroupDocArgs): Promise<ShareScheduleResult> {
  if (typeof navigator === "undefined" || typeof document === "undefined") {
    throw new Error("غير متاح في هذا السياق.");
  }

  const canvas = await captureScheduleGroupCanvas(args);
  const slug = fileSlug(args.departmentName);
  const baseName = `exam-schedule-${slug}`;
  const caption = buildScheduleGroupWhatsAppCaption(args.collegeLabel, args.departmentName);

  const pdfBlob = canvasToPdfBlob(canvas);
  const pdfFile = new File([pdfBlob], `${baseName}.pdf`, { type: "application/pdf" });

  const hasShare = typeof navigator.share === "function";

  if (hasShare && canShareFile(pdfFile)) {
    try {
      await navigator.share({
        files: [pdfFile],
        title: "جدول الامتحانات",
        text: caption,
      });
      return "shared_pdf";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      throw e;
    }
  }

  const pngBlob = await canvasToPngBlob(canvas);
  const pngFile = new File([pngBlob], `${baseName}.png`, { type: "image/png" });

  if (hasShare && canShareFile(pngFile)) {
    try {
      await navigator.share({
        files: [pngFile],
        title: "جدول الامتحانات",
        text: caption,
      });
      return "shared_png";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      throw e;
    }
  }

  triggerBlobDownload(pdfBlob, `${baseName}.pdf`);
  const wa = `https://wa.me/?text=${encodeURIComponent(`${caption}\n\n⬇️ أرفق ملف PDF الذي تم تنزيله للتو.`)}`;
  window.open(wa, "_blank", "noopener,noreferrer");
  return "downloaded_pdf";
}

/**
 * تصدير جدول امتحانات قسم/فرع واحد إلى PDF رسمي بمقاس A4 (عرض HTML ثم التقاطه).
 */
export async function downloadCollegeScheduleGroupPdf(args: ScheduleGroupDocArgs): Promise<void> {
  if (args.rows.length === 0) return;
  if (typeof document === "undefined") return;

  const canvas = await captureScheduleGroupCanvas(args);
  const blob = canvasToPdfBlob(canvas);
  triggerBlobDownload(blob, `exam-schedule-${fileSlug(args.departmentName)}.pdf`);
}
