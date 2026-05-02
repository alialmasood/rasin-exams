import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { collegePortalDisplayLabel } from "@/lib/college-portal-scope";
import { listSubmittedSituationFormsForOwner } from "@/lib/college-situation-form-submissions";
import {
  buildFollowupDaySaveHintsForOwner,
  followupDepartmentScopeKey,
  listFollowupSavedDayReportsForOwner,
  normalizeFollowupExamDateKey,
} from "@/lib/college-followup-saved-reports";
import { buildFollowupDayReportBundles } from "@/lib/followup-day-bundles";
import {
  listExamDatesWithBothMealsFullyComplete,
  listExamDayUploadSummariesForOwner,
  listUploadedExamSituationsForFollowup,
  type StatusFollowupFormRow,
  type StatusFollowupRow,
  type StatusFollowupScheduleRow,
} from "@/lib/college-exam-situations";
import { StatusFollowupPanel } from "@/app/dashboard/college/status-followup/status-followup-panel";
import { requireDepartmentPortalWorkspace } from "../dept-workspace";

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

export default async function DepartmentStatusFollowupPage() {
  const { ws } = await requireDepartmentPortalWorkspace();
  const profile = await getCollegeProfileByUserId(ws.sessionUserId);
  const collegeLabel = profile ? collegePortalDisplayLabel(profile) : ws.collegeLabel;
  const branchFilter = profile?.scoped_branch_name?.trim() ?? "";

  const sid = ws.collegeSubjectId?.trim() ?? "";
  const deptSavedScopeKey =
    sid.length > 0 ? followupDepartmentScopeKey(sid, profile?.scoped_branch_name) : null;

  const [scheduleRows, formRowsAll, daySummaries, savedReportsRaw] = await Promise.all([
    listUploadedExamSituationsForFollowup(ws.dataOwnerUserId, ws.collegeSubjectId),
    listSubmittedSituationFormsForOwner(ws.dataOwnerUserId),
    listExamDayUploadSummariesForOwner(
      ws.dataOwnerUserId,
      ws.collegeSubjectId,
      branchFilter.length > 0 ? branchFilter : undefined
    ),
    listFollowupSavedDayReportsForOwner(
      ws.dataOwnerUserId,
      deptSavedScopeKey ? { departmentScopeKey: deptSavedScopeKey } : {}
    ),
  ]);

  const formRows =
    branchFilter.length > 0
      ? formRowsAll.filter((f) => f.branch_name.trim() === branchFilter)
      : formRowsAll;

  const rows = mergeFollowupRows(scheduleRows, formRows);

  const fullDayBothMealsReadyDates = listExamDatesWithBothMealsFullyComplete(daySummaries);

  const completedDays = daySummaries.filter(
    (d) => d.total_sessions > 0 && d.uploaded_sessions >= d.total_sessions
  );
  const dayBundles = buildFollowupDayReportBundles(completedDays, fullDayBothMealsReadyDates);
  const followupDaySaveHints = await buildFollowupDaySaveHintsForOwner({
    ownerUserId: ws.dataOwnerUserId,
    savedRows: savedReportsRaw,
    examDates: dayBundles.map((b) => b.examDate),
    restrictCollegeSubjectId: ws.collegeSubjectId ?? undefined,
    restrictBranchName: branchFilter.length > 0 ? branchFilter : null,
  });

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
    />
  );
}
