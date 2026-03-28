"use server";

import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { buildDailyExamSituationsFinalReportHtml } from "@/lib/college-exam-situation-report-html";
import {
  listExamDayUploadSummariesForOwner,
  listUploadedExamSituationDetailsForOwnerExamDate,
} from "@/lib/college-exam-situations";
import { getSession } from "@/lib/session";

export type DailyReportActionResult =
  | { ok: true; html: string }
  | { ok: false; message: string };

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

export async function getDailyFinalSituationReportHtmlAction(examDate: string): Promise<DailyReportActionResult> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, message: "صيغة التاريخ غير صالحة." };

  const [summaries, profile] = await Promise.all([
    listExamDayUploadSummariesForOwner(session.uid),
    getCollegeProfileByUserId(session.uid),
  ]);
  const day = summaries.find((x) => x.exam_date === d);
  if (!day || day.total_sessions === 0) {
    return { ok: false, message: "لا توجد جلسات مجدولة لهذا اليوم في الجداول المرسلة أو المعتمدة." };
  }
  if (day.uploaded_sessions < day.total_sessions) {
    return {
      ok: false,
      message: `لم يكتمل رفع مواقف هذا اليوم بعد (${day.uploaded_sessions} من ${day.total_sessions}). ارفع موقف كل مادة ثم أعد المحاولة.`,
    };
  }

  const details = await listUploadedExamSituationDetailsForOwnerExamDate(session.uid, d);
  const collegeLabel =
    profile?.account_kind === "FOLLOWUP" ? (profile.holder_name ?? "—") : (profile?.formation_name ?? "—");
  const deanName = profile?.dean_name ?? "";

  const html = buildDailyExamSituationsFinalReportHtml(details, d, collegeLabel, deanName, generatedAtLabelAr());
  return { ok: true, html };
}
