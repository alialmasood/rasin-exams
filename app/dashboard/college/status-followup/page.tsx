import { redirect } from "next/navigation";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import {
  listExamDayUploadSummariesForOwner,
  listUploadedExamSituationsForFollowup,
} from "@/lib/college-exam-situations";
import { getSession } from "@/lib/session";
import { StatusFollowupPanel } from "./status-followup-panel";

export const dynamic = "force-dynamic";

export default async function CollegeStatusFollowupPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") redirect("/dashboard");

  const [rows, profile, daySummaries] = await Promise.all([
    listUploadedExamSituationsForFollowup(session.uid),
    getCollegeProfileByUserId(session.uid),
    listExamDayUploadSummariesForOwner(session.uid),
  ]);

  const collegeLabel =
    profile?.account_kind === "FOLLOWUP"
      ? (profile.holder_name ?? "—")
      : (profile?.formation_name ?? "—");

  return (
    <StatusFollowupPanel rows={rows} collegeLabel={collegeLabel} daySummaries={daySummaries} />
  );
}
