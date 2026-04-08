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
import {
  deleteExamSituationReportForOwner,
  getExamSituationDetailForOwner,
} from "@/lib/college-exam-situations";
import { recordCollegeActivityEvent } from "@/lib/college-activity-log";
import {
  collegePortalDisplayLabel,
  departmentCanAccessCollegeSubjectRow,
  getCollegePortalDataOwnerUserId,
} from "@/lib/college-portal-scope";
import { revalidateCollegePortalSegment } from "@/lib/revalidate-college-portal";
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
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, message: "صيغة التاريخ غير صالحة." };
  if (mealSlot !== 1 && mealSlot !== 2) return { ok: false, message: "رقم الوجبة غير صالح." };

  const profile = await getCollegeProfileByUserId(session.uid);
  if (!profile) return { ok: false, message: "تعذر تحميل الملف التعريفي." };
  const collegeLabel = collegePortalDisplayLabel(profile);
  const deanName = profile?.dean_name ?? "";

  return buildDailyFinalSituationReportHtmlForOwner({
    ownerUserId,
    examDate: d,
    mealSlot,
    collegeLabel,
    deanName,
  });
}

export async function getDailyFullDayBothMealsReportHtmlAction(examDate: string): Promise<DailyReportActionResult> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, message: "صيغة التاريخ غير صالحة." };

  const profile = await getCollegeProfileByUserId(session.uid);
  if (!profile) return { ok: false, message: "تعذر تحميل الملف التعريفي." };
  const collegeLabel = collegePortalDisplayLabel(profile);
  const deanName = profile?.dean_name ?? "";

  return buildDailyFinalFullDayBothMealsReportHtmlForOwner({
    ownerUserId,
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
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, message: "صيغة التاريخ غير صالحة." };

  const profile = await getCollegeProfileByUserId(session.uid);
  if (!profile) return { ok: false, message: "تعذر تحميل الملف التعريفي." };
  const collegeLabel = collegePortalDisplayLabel(profile);
  const deanName = profile?.dean_name ?? "";

  const built = await buildSavableFollowupDayReportsForOwner({
    ownerUserId,
    examDate: d,
    collegeLabel,
    deanName,
  });
  if (!built.ok) return built;

  const ins = await insertFollowupSavedDayReport({
    ownerUserId,
    examDate: d,
    meal1Html: built.reports.meal1,
    meal2Html: built.reports.meal2,
    bothMealsHtml: built.reports.both,
  });
  if (!ins.ok) return ins;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "save",
    resource: "followup_saved_report",
    summary: `حفظ تقارير متابعة المواقف ليوم الامتحان ${d} في الأرشيف.`,
    details: { examDate: d, reportId: ins.id },
  });
  revalidateCollegePortalSegment("status-followup");
  return { ok: true, id: ins.id };
}

export async function getSavedFollowupDayReportHtmlAction(
  reportId: string,
  part: SavedReportPart
): Promise<DailyReportActionResult> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  return getFollowupSavedDayReportHtmlForOwner(ownerUserId, reportId.trim(), part);
}

export async function deleteSavedFollowupDayReportAction(
  reportId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const rid = reportId.trim();
  const res = await deleteFollowupSavedDayReportForOwner(ownerUserId, rid);
  if (res.ok) {
    void recordCollegeActivityEvent({
      ownerUserId,
      action: "delete",
      resource: "followup_saved_report",
      summary: `حذف تقرير متابعة محفوظ (المعرّف ${rid}).`,
      details: { reportId: rid },
    });
    revalidateCollegePortalSegment("status-followup");
  }
  return res;
}

export async function deleteUploadedExamSituationAction(
  scheduleId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح." };
  }
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const sid = scheduleId.trim();
  const detail = await getExamSituationDetailForOwner(ownerUserId, sid);
  if (!detail || !departmentCanAccessCollegeSubjectRow(session, detail.college_subject_id)) {
    return { ok: false, message: "لا يمكن الوصول لهذا الجدول." };
  }
  const res = await deleteExamSituationReportForOwner({ ownerUserId, scheduleId: sid });
  if (res.ok) {
    void recordCollegeActivityEvent({
      ownerUserId,
      action: "delete",
      resource: "situation_report",
      summary: `حذف موقف مرفوع مرتبط بجدول امتحاني (معرّف الجدول ${sid}).`,
      details: { scheduleId: sid },
    });
    revalidateCollegePortalSegment("status-followup");
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
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const subId = submissionId.trim();
  const res = await deleteSituationFormSubmissionForOwner(ownerUserId, subId);
  if (res.ok) {
    void recordCollegeActivityEvent({
      ownerUserId,
      action: "delete",
      resource: "situation_form",
      summary: `حذف إرسال نموذج موقف (المعرّف ${subId}).`,
      details: { submissionId: subId },
    });
    revalidateCollegePortalSegment("status-followup");
    revalidatePath("/tracking");
    revalidatePath("/dashboard/situations-followup");
  }
  return res;
}
