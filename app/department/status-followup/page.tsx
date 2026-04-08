import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { collegePortalDisplayLabel } from "@/lib/college-portal-scope";
import { listSubmittedSituationFormsForOwner } from "@/lib/college-situation-form-submissions";
import { listFollowupSavedDayReportsForOwner } from "@/lib/college-followup-saved-reports";
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

  const [scheduleRows, formRowsAll, daySummaries, savedReportsRaw] = await Promise.all([
    listUploadedExamSituationsForFollowup(ws.dataOwnerUserId, ws.collegeSubjectId),
    listSubmittedSituationFormsForOwner(ws.dataOwnerUserId),
    listExamDayUploadSummariesForOwner(ws.dataOwnerUserId, ws.collegeSubjectId),
    listFollowupSavedDayReportsForOwner(ws.dataOwnerUserId),
  ]);

  const formRows =
    branchFilter.length > 0
      ? formRowsAll.filter((f) => f.branch_name.trim() === branchFilter)
      : formRowsAll;

  const rows = mergeFollowupRows(scheduleRows, formRows);

  const fullDayBothMealsReadyDates = listExamDatesWithBothMealsFullyComplete(daySummaries);

  const savedReports = savedReportsRaw.map((r) => ({
    id: r.id,
    exam_date: r.exam_date,
    saved_at_iso: r.saved_at.toISOString(),
    has_meal_1: r.has_meal_1,
    has_meal_2: r.has_meal_2,
    has_both_meals: r.has_both_meals,
  }));

  const examDatesAlreadySaved = [...new Set(savedReports.map((s) => s.exam_date))].sort((a, b) =>
    a.localeCompare(b)
  );

  return (
    <StatusFollowupPanel
      rows={rows}
      collegeLabel={collegeLabel}
      daySummaries={daySummaries}
      fullDayBothMealsReadyDates={fullDayBothMealsReadyDates}
      savedReports={savedReports}
      examDatesAlreadySaved={examDatesAlreadySaved}
    />
  );
}
