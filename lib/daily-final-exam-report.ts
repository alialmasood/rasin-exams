import { readFile } from "fs/promises";
import path from "path";
import { buildDailyExamSituationsFinalReportHtml } from "@/lib/college-exam-situation-report-html";
import {
  listExamDayUploadSummariesForOwner,
  listExamDatesWithBothMealsFullyComplete,
  listUploadedExamSituationDetailsForOwnerExamDate,
} from "@/lib/college-exam-situations";

export async function loadUobLogoDataUriForReport(): Promise<string | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "uob-logo.png"));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function generatedAtLabelAr(): string {
  try {
    return new Date().toLocaleString("ar-IQ", {
      timeZone: "Asia/Baghdad",
      dateStyle: "full",
      timeStyle: "short",
    });
  } catch {
    return new Date().toISOString();
  }
}

export type DailyFinalReportResult = { ok: true; html: string } | { ok: false; message: string };

/**
 * تقرير نهائي لوجبة (نفس منطق صفحة متابعة المواقف) لمالك تشكيل محدد.
 */
export async function buildDailyFinalSituationReportHtmlForOwner(params: {
  ownerUserId: string;
  examDate: string;
  mealSlot: 1 | 2;
  collegeLabel: string;
  deanName: string;
}): Promise<DailyFinalReportResult> {
  const { ownerUserId, examDate, mealSlot, collegeLabel, deanName } = params;
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { ok: false, message: "صيغة التاريخ غير صالحة." };
  }
  if (mealSlot !== 1 && mealSlot !== 2) {
    return { ok: false, message: "رقم الوجبة غير صالح." };
  }

  const summaries = await listExamDayUploadSummariesForOwner(ownerUserId);
  const seg = summaries.find((x) => x.exam_date === d && x.meal_slot === mealSlot);
  if (!seg || seg.total_sessions === 0) {
    return {
      ok: false,
      message: "لا توجد جلسات مجدولة لهذا اليوم والوجبة المختارة في الجداول المرسلة أو المعتمدة.",
    };
  }
  if (seg.uploaded_sessions < seg.total_sessions) {
    const mealAr = mealSlot === 1 ? "الوجبة الأولى" : "الوجبة الثانية";
    return {
      ok: false,
      message: `لم يكتمل رفع مواقف ${mealAr} لهذا اليوم بعد (${seg.uploaded_sessions} من ${seg.total_sessions}). ارفع موقف كل جلسة في هذه الوجبة ثم أعد المحاولة.`,
    };
  }

  const [details, logoDataUri] = await Promise.all([
    listUploadedExamSituationDetailsForOwnerExamDate(ownerUserId, d, mealSlot),
    loadUobLogoDataUriForReport(),
  ]);

  const html = buildDailyExamSituationsFinalReportHtml(
    details,
    d,
    collegeLabel,
    deanName,
    generatedAtLabelAr(),
    mealSlot,
    { logoDataUri, universityNameAr: "جامعة البصرة" }
  );
  return { ok: true, html };
}

/**
 * تقرير نهائي واحد يجمع جلسات الوجبتين ليوم واحد — بعد التحقق من اكتمال رفع موقف كل جلسة في كلتا الوجبتين.
 */
export async function buildDailyFinalFullDayBothMealsReportHtmlForOwner(params: {
  ownerUserId: string;
  examDate: string;
  collegeLabel: string;
  deanName: string;
}): Promise<DailyFinalReportResult> {
  const { ownerUserId, examDate, collegeLabel, deanName } = params;
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { ok: false, message: "صيغة التاريخ غير صالحة." };
  }

  const summaries = await listExamDayUploadSummariesForOwner(ownerUserId);
  const okDates = listExamDatesWithBothMealsFullyComplete(summaries);
  if (!okDates.includes(d)) {
    return {
      ok: false,
      message:
        "لا يتاح التقرير الشامل إلا عند وجود جلسات للوجبتين في هذا اليوم واكتمال رفع موقف كل الجلسات فيهما. أكمل رفع مواقف الوجبة الأولى والثانية ثم أعد المحاولة.",
    };
  }

  let details = await listUploadedExamSituationDetailsForOwnerExamDate(ownerUserId, d);
  details = [...details].sort((a, b) => {
    const ma = a.meal_slot ?? 1;
    const mb = b.meal_slot ?? 1;
    if (ma !== mb) return ma - mb;
    return String(a.start_time).localeCompare(String(b.start_time));
  });

  const logoDataUri = await loadUobLogoDataUriForReport();
  const html = buildDailyExamSituationsFinalReportHtml(details, d, collegeLabel, deanName, generatedAtLabelAr(), undefined, {
    logoDataUri,
    universityNameAr: "جامعة البصرة",
    fullDayBothMeals: true,
  });
  return { ok: true, html };
}

/** يبني كل التقارير النهائية المتاحة ليوم محدد (للحفظ دفعة واحدة). */
export type SavableFollowupDayReports = {
  meal1: string | null;
  meal2: string | null;
  both: string | null;
};

export async function buildSavableFollowupDayReportsForOwner(params: {
  ownerUserId: string;
  examDate: string;
  collegeLabel: string;
  deanName: string;
}): Promise<{ ok: true; reports: SavableFollowupDayReports } | { ok: false; message: string }> {
  const { ownerUserId, examDate, collegeLabel, deanName } = params;
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { ok: false, message: "صيغة التاريخ غير صالحة." };
  }

  const [r1, r2, rb] = await Promise.all([
    buildDailyFinalSituationReportHtmlForOwner({
      ownerUserId,
      examDate: d,
      mealSlot: 1,
      collegeLabel,
      deanName,
    }),
    buildDailyFinalSituationReportHtmlForOwner({
      ownerUserId,
      examDate: d,
      mealSlot: 2,
      collegeLabel,
      deanName,
    }),
    buildDailyFinalFullDayBothMealsReportHtmlForOwner({
      ownerUserId,
      examDate: d,
      collegeLabel,
      deanName,
    }),
  ]);

  const meal1 = r1.ok ? r1.html : null;
  const meal2 = r2.ok ? r2.html : null;
  const both = rb.ok ? rb.html : null;

  if (!meal1 && !meal2 && !both) {
    return {
      ok: false,
      message:
        "لا توجد تقارير نهائية مكتملة لهذا اليوم للحفظ. أكمل رفع مواقف الوجبات المتاحة ثم أعد المحاولة.",
    };
  }
  return { ok: true, reports: { meal1, meal2, both } };
}
