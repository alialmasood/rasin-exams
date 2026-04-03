"use server";

import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import type { CollegeExamScheduleRow } from "@/lib/college-exam-schedules";
import { listCollegeExamSchedulesByOwnerForExamDate } from "@/lib/college-exam-schedules";
import {
  buildDailyFinalFullDayBothMealsReportHtmlForOwner,
  buildDailyFinalSituationReportHtmlForOwner,
} from "@/lib/daily-final-exam-report";
import {
  getExamSituationBundleForOwner,
  listCentralTrackingExamRowsForDate,
  type CentralTrackingExamRow,
  type ExamSituationAggregates,
  type ExamSituationDetail,
} from "@/lib/college-exam-situations";
import { getSession } from "@/lib/session";

export type FollowupFormationScheduleDayRow = Omit<CollegeExamScheduleRow, "created_at"> & {
  created_at: string;
};

/**
 * جلب جدول الامتحانات الكامل لتشكيل ليوم محدد — حساب المتابعة المركزية فقط.
 * يُسمح فقط إذا ظهرت التشكيل في بيانات المتابعة لذلك اليوم (نفس owner_user_id).
 */
export async function getFollowupFormationExamSchedulesForDateAction(
  formationName: string,
  examDate: string
): Promise<
  | { ok: true; formationLabel: string; rows: FollowupFormationScheduleDayRow[] }
  | { ok: false; message: string }
> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح." };
  }
  const profile = await getCollegeProfileByUserId(session.uid);
  if (profile?.account_kind !== "FOLLOWUP") {
    return { ok: false, message: "غير مصرح." };
  }
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { ok: false, message: "صيغة التاريخ غير صالحة." };
  }
  const name = formationName.trim();
  if (!name) {
    return { ok: false, message: "اسم التشكيل غير صالح." };
  }

  const trackingRows = await listCentralTrackingExamRowsForDate(d);
  const hit = trackingRows.find((r) => r.collegeName.trim() === name);
  if (!hit) {
    return {
      ok: false,
      message: "لا توجد جلسات مسجّلة لهذا التشكيل في يوم المتابعة الحالي — لا يمكن عرض الجدول.",
    };
  }

  const schedules = await listCollegeExamSchedulesByOwnerForExamDate(hit.ownerUserId, d);
  const rows: FollowupFormationScheduleDayRow[] = schedules.map((s) => ({
    ...s,
    created_at: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at),
  }));

  return { ok: true, formationLabel: name, rows };
}

export async function refreshCentralTrackingAction(
  examDate: string
): Promise<{ ok: true; rows: CentralTrackingExamRow[] } | { ok: false; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح." };
  }
  const profile = await getCollegeProfileByUserId(session.uid);
  if (profile?.account_kind !== "FOLLOWUP") {
    return { ok: false, message: "غير مصرح." };
  }
  const rows = await listCentralTrackingExamRowsForDate(examDate);
  return { ok: true, rows };
}

/** تسليم JSON للعميل — تواريخ كسلسلة ISO */
export type FollowupExamSituationDetailJson = Omit<ExamSituationDetail, "head_submitted_at" | "dean_reviewed_at"> & {
  head_submitted_at: string | null;
  dean_reviewed_at: string | null;
};

export type FollowupExamSituationBundleJson = {
  sessions: FollowupExamSituationDetailJson[];
  active_schedule_id: string;
  aggregates: ExamSituationAggregates;
};

function serializeExamSituationDetail(s: ExamSituationDetail): FollowupExamSituationDetailJson {
  return {
    ...s,
    head_submitted_at: s.head_submitted_at?.toISOString() ?? null,
    dean_reviewed_at: s.dean_reviewed_at?.toISOString() ?? null,
  };
}

/**
 * حزمة موقف جلسة (كما في صفحة رفع الموقف) لحساب المتابعة المركزية — بعد التحقق من ظهور الجلسة في يوم المتابعة.
 */
export async function getFollowupExamSituationBundleAction(
  scheduleId: string,
  examDate: string
): Promise<
  | { ok: true; bundle: FollowupExamSituationBundleJson; collegeLabel: string; deanName: string }
  | { ok: false; message: string }
> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح." };
  }
  const me = await getCollegeProfileByUserId(session.uid);
  if (me?.account_kind !== "FOLLOWUP") {
    return { ok: false, message: "غير مصرح." };
  }
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { ok: false, message: "صيغة التاريخ غير صالحة." };
  }
  const sid = scheduleId.trim();
  if (!/^\d+$/.test(sid)) {
    return { ok: false, message: "معرّف الجدول غير صالح." };
  }

  const trackingRows = await listCentralTrackingExamRowsForDate(d);
  const hit = trackingRows.find((r) => r.scheduleId === sid);
  if (!hit) {
    return { ok: false, message: "هذه الجلسة غير ضمن متابعة هذا اليوم — لا يمكن عرض التقرير." };
  }

  const bundle = await getExamSituationBundleForOwner(hit.ownerUserId, sid);
  if (!bundle) {
    return { ok: false, message: "تعذر تحميل بيانات الموقف." };
  }

  const ownerProfile = await getCollegeProfileByUserId(hit.ownerUserId);
  const collegeLabel =
    ownerProfile?.formation_name?.trim() ||
    ownerProfile?.holder_name?.trim() ||
    hit.collegeName.trim() ||
    "—";
  const deanName = ownerProfile?.dean_name ?? "";

  return {
    ok: true,
    bundle: {
      sessions: bundle.sessions.map(serializeExamSituationDetail),
      active_schedule_id: bundle.active_schedule_id,
      aggregates: bundle.aggregates,
    },
    collegeLabel,
    deanName,
  };
}

/** تقرير نهائي لوجبة — لتشكيل يظهر في المتابعة لذلك اليوم (نفس قالب status-followup). */
export async function getFollowupFormationMealDailyReportHtmlAction(
  formationName: string,
  examDate: string,
  mealSlot: 1 | 2
): Promise<{ ok: true; html: string } | { ok: false; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح." };
  }
  const me = await getCollegeProfileByUserId(session.uid);
  if (me?.account_kind !== "FOLLOWUP") {
    return { ok: false, message: "غير مصرح." };
  }
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { ok: false, message: "صيغة التاريخ غير صالحة." };
  }
  if (mealSlot !== 1 && mealSlot !== 2) {
    return { ok: false, message: "رقم الوجبة غير صالح." };
  }
  const name = formationName.trim();
  if (!name) {
    return { ok: false, message: "اسم التشكيل غير صالح." };
  }

  const trackingRows = await listCentralTrackingExamRowsForDate(d);
  const hit = trackingRows.find((r) => r.collegeName.trim() === name);
  if (!hit) {
    return {
      ok: false,
      message: "لا توجد جلسات مسجّلة لهذا التشكيل في يوم المتابعة الحالي.",
    };
  }

  const ownerProfile = await getCollegeProfileByUserId(hit.ownerUserId);
  const collegeLabel =
    ownerProfile?.formation_name?.trim() ||
    ownerProfile?.holder_name?.trim() ||
    hit.collegeName.trim() ||
    "—";
  const deanName = ownerProfile?.dean_name ?? "";

  return buildDailyFinalSituationReportHtmlForOwner({
    ownerUserId: hit.ownerUserId,
    examDate: d,
    mealSlot,
    collegeLabel,
    deanName,
  });
}

/** تقرير شامل للوجبتين — نفس قالب صفحة متابعة المواقف — لتشكيل يظهر في المتابعة لذلك اليوم. */
export async function getFollowupFormationFullDayBothMealsReportHtmlAction(
  formationName: string,
  examDate: string
): Promise<{ ok: true; html: string } | { ok: false; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح." };
  }
  const me = await getCollegeProfileByUserId(session.uid);
  if (me?.account_kind !== "FOLLOWUP") {
    return { ok: false, message: "غير مصرح." };
  }
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { ok: false, message: "صيغة التاريخ غير صالحة." };
  }
  const name = formationName.trim();
  if (!name) {
    return { ok: false, message: "اسم التشكيل غير صالح." };
  }

  const trackingRows = await listCentralTrackingExamRowsForDate(d);
  const hit = trackingRows.find((r) => r.collegeName.trim() === name);
  if (!hit) {
    return {
      ok: false,
      message: "لا توجد جلسات مسجّلة لهذا التشكيل في يوم المتابعة الحالي.",
    };
  }

  const ownerProfile = await getCollegeProfileByUserId(hit.ownerUserId);
  const collegeLabel =
    ownerProfile?.formation_name?.trim() ||
    ownerProfile?.holder_name?.trim() ||
    hit.collegeName.trim() ||
    "—";
  const deanName = ownerProfile?.dean_name ?? "";

  return buildDailyFinalFullDayBothMealsReportHtmlForOwner({
    ownerUserId: hit.ownerUserId,
    examDate: d,
    collegeLabel,
    deanName,
  });
}
