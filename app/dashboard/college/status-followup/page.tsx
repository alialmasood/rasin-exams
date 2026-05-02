import { redirect } from "next/navigation";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { listSubmittedSituationFormsForOwner } from "@/lib/college-situation-form-submissions";
import {
  buildFollowupDaySaveHintsForOwner,
  listFollowupSavedDayReportsForOwner,
  normalizeFollowupExamDateKey,
} from "@/lib/college-followup-saved-reports";
import { buildFollowupDayReportBundles } from "@/lib/followup-day-bundles";
import {
  buildFormationFollowupAlerts,
  listExamDatesWithBothMealsFullyComplete,
  listExamDayUploadSummariesForOwner,
  listOfficialExamSituationsForOwner,
  listUploadedExamSituationsForFollowup,
  type StatusFollowupFormRow,
  type StatusFollowupRow,
  type StatusFollowupScheduleRow,
} from "@/lib/college-exam-situations";
import { getSession } from "@/lib/session";
import { StatusFollowupPanel } from "./status-followup-panel";

export const dynamic = "force-dynamic";

function mergeFollowupRows(
  schedules: StatusFollowupScheduleRow[],
  forms: StatusFollowupFormRow[]
): StatusFollowupRow[] {
  type WithTs = StatusFollowupRow & { _ts: number };
  const a: WithTs[] = schedules.map((r) => ({
    ...r,
    _ts: r.head_submitted_at_iso ? new Date(r.head_submitted_at_iso).getTime() : 0,
  }));
  const b: WithTs[] = forms.map((r) => ({
    ...r,
    _ts: new Date(r.submitted_at_iso).getTime(),
  }));
  return [...a, ...b].sort((x, y) => y._ts - x._ts).map(({ _ts, ...row }) => row);
}

export default async function CollegeStatusFollowupPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") redirect("/dashboard");

  const profilePromise = getCollegeProfileByUserId(session.uid);
  const [scheduleRows, formRows, profile, daySummaries, savedReportsRaw, allSituationRows] =
    await Promise.all([
      listUploadedExamSituationsForFollowup(session.uid),
      listSubmittedSituationFormsForOwner(session.uid),
      profilePromise,
      listExamDayUploadSummariesForOwner(session.uid),
      listFollowupSavedDayReportsForOwner(session.uid),
      profilePromise.then((p) =>
        p?.account_kind === "FORMATION" ? listOfficialExamSituationsForOwner(session.uid) : []
      ),
    ]);
  const rows = mergeFollowupRows(scheduleRows, formRows);

  const formationFollowupAlerts =
    profile?.account_kind === "FORMATION" ? buildFormationFollowupAlerts(allSituationRows) : null;

  const collegeLabel =
    profile?.account_kind === "FOLLOWUP"
      ? (profile.holder_name ?? "—")
      : (profile?.formation_name ?? "—");

  const fullDayBothMealsReadyDates = listExamDatesWithBothMealsFullyComplete(daySummaries);

  const completedDays = daySummaries.filter(
    (d) => d.total_sessions > 0 && d.uploaded_sessions >= d.total_sessions
  );
  const dayBundles = buildFollowupDayReportBundles(completedDays, fullDayBothMealsReadyDates);
  const followupDaySaveHints = await buildFollowupDaySaveHintsForOwner({
    ownerUserId: session.uid,
    savedRows: savedReportsRaw,
    examDates: dayBundles.map((b) => b.examDate),
  });

  /** يطابق زر «حفظ الموقف» على الخادم لتفادي اختلاف الترطيب (SSR مقابل أول إطار في العميل). */
  const followupInitialMergeBlockedByDayKey: Record<string, boolean> = {};
  for (const b of dayBundles) {
    const k = normalizeFollowupExamDateKey(b.examDate);
    const h = followupDaySaveHints[k];
    followupInitialMergeBlockedByDayKey[k] = !(h?.allowMergeSave ?? true);
  }

  const savedReports = savedReportsRaw.map((r) => ({
    id: r.id,
    exam_date: normalizeFollowupExamDateKey(r.exam_date),
    saved_at_iso: r.saved_at.toISOString(),
    has_meal_1: r.has_meal_1,
    has_meal_2: r.has_meal_2,
    has_both_meals: r.has_both_meals,
  }));

  return (
    <StatusFollowupPanel
      rows={rows}
      collegeLabel={collegeLabel}
      daySummaries={daySummaries}
      fullDayBothMealsReadyDates={fullDayBothMealsReadyDates}
      savedReports={savedReports}
      followupDaySaveHints={followupDaySaveHints}
      followupInitialMergeBlockedByDayKey={followupInitialMergeBlockedByDayKey}
      formationFollowupAlerts={formationFollowupAlerts}
    />
  );
}
