"use server";

import { revalidatePath } from "next/cache";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import {
  buildDailyFinalFullDayBothMealsReportHtmlForOwner,
  buildDailyFinalSituationReportHtmlForOwner,
  buildSavableFollowupDayReportsForOwner,
} from "@/lib/daily-final-exam-report";
import {
  deleteFollowupSavedDayReportForOwner,
  getFollowupSavedDayReportHtmlForOwner,
  insertFollowupSavedDayReport,
} from "@/lib/college-followup-saved-reports";
import type { SavedReportPart } from "@/lib/college-followup-saved-reports";
import { deleteSituationFormSubmissionForOwner } from "@/lib/college-situation-form-submissions";
import { deleteExamSituationReportForOwner } from "@/lib/college-exam-situations";
import { getSession } from "@/lib/session";

export type { SavedReportPart } from "@/lib/college-followup-saved-reports";

export type DailyReportActionResult =
  | { ok: true; html: string }
  | { ok: false; message: string };

export async function getDailyFinalSituationReportHtmlAction(
  examDate: string,
  mealSlot: 1 | 2
): Promise<DailyReportActionResult> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, message: "صيغة التاريخ غير صالحة." };
  if (mealSlot !== 1 && mealSlot !== 2) return { ok: false, message: "رقم الوجبة غير صالح." };

  const profile = await getCollegeProfileByUserId(session.uid);
  const collegeLabel =
    profile?.account_kind === "FOLLOWUP" ? (profile.holder_name ?? "—") : (profile?.formation_name ?? "—");
  const deanName = profile?.dean_name ?? "";

  return buildDailyFinalSituationReportHtmlForOwner({
    ownerUserId: session.uid,
    examDate: d,
    mealSlot,
    collegeLabel,
    deanName,
  });
}

export async function getDailyFullDayBothMealsReportHtmlAction(examDate: string): Promise<DailyReportActionResult> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, message: "صيغة التاريخ غير صالحة." };

  const profile = await getCollegeProfileByUserId(session.uid);
  const collegeLabel =
    profile?.account_kind === "FOLLOWUP" ? (profile.holder_name ?? "—") : (profile?.formation_name ?? "—");
  const deanName = profile?.dean_name ?? "";

  return buildDailyFinalFullDayBothMealsReportHtmlForOwner({
    ownerUserId: session.uid,
    examDate: d,
    collegeLabel,
    deanName,
  });
}

export async function saveFollowupDayReportsAction(
  examDate: string
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, message: "صيغة التاريخ غير صالحة." };

  const profile = await getCollegeProfileByUserId(session.uid);
  const collegeLabel =
    profile?.account_kind === "FOLLOWUP" ? (profile.holder_name ?? "—") : (profile?.formation_name ?? "—");
  const deanName = profile?.dean_name ?? "";

  const built = await buildSavableFollowupDayReportsForOwner({
    ownerUserId: session.uid,
    examDate: d,
    collegeLabel,
    deanName,
  });
  if (!built.ok) return built;

  const ins = await insertFollowupSavedDayReport({
    ownerUserId: session.uid,
    examDate: d,
    meal1Html: built.reports.meal1,
    meal2Html: built.reports.meal2,
    bothMealsHtml: built.reports.both,
  });
  if (!ins.ok) return ins;
  revalidatePath("/dashboard/college/status-followup");
  return { ok: true, id: ins.id };
}

export async function getSavedFollowupDayReportHtmlAction(
  reportId: string,
  part: SavedReportPart
): Promise<DailyReportActionResult> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  return getFollowupSavedDayReportHtmlForOwner(session.uid, reportId.trim(), part);
}

export async function deleteSavedFollowupDayReportAction(
  reportId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const res = await deleteFollowupSavedDayReportForOwner(session.uid, reportId.trim());
  if (res.ok) revalidatePath("/dashboard/college/status-followup");
  return res;
}

export async function deleteUploadedExamSituationAction(
  scheduleId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح." };
  }
  const res = await deleteExamSituationReportForOwner({ ownerUserId: session.uid, scheduleId });
  if (res.ok) {
    revalidatePath("/dashboard/college/status-followup");
    revalidatePath("/tracking");
  }
  return res;
}

export async function deleteSituationFormSubmissionAction(
  submissionId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح." };
  }
  const res = await deleteSituationFormSubmissionForOwner(session.uid, submissionId);
  if (res.ok) {
    revalidatePath("/dashboard/college/status-followup");
    revalidatePath("/tracking");
    revalidatePath("/dashboard/situations-followup");
  }
  return res;
}
