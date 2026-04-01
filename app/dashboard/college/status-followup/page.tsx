import { redirect } from "next/navigation";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { listSubmittedSituationFormsForOwner } from "@/lib/college-situation-form-submissions";
import {
  listExamDayUploadSummariesForOwner,
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

  const [scheduleRows, formRows, profile, daySummaries] = await Promise.all([
    listUploadedExamSituationsForFollowup(session.uid),
    listSubmittedSituationFormsForOwner(session.uid),
    getCollegeProfileByUserId(session.uid),
    listExamDayUploadSummariesForOwner(session.uid),
  ]);
  const rows = mergeFollowupRows(scheduleRows, formRows);

  const collegeLabel =
    profile?.account_kind === "FOLLOWUP"
      ? (profile.holder_name ?? "—")
      : (profile?.formation_name ?? "—");

  return (
    <StatusFollowupPanel rows={rows} collegeLabel={collegeLabel} daySummaries={daySummaries} />
  );
}
