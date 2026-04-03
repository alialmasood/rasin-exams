import { redirect } from "next/navigation";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { listOfficialExamSituationsForOwner } from "@/lib/college-exam-situations";
import { buildUploadStatusListItems, computeUploadStatusDashboardStats } from "@/lib/upload-status-display";
import { getSession } from "@/lib/session";
import { UploadStatusPanel } from "./upload-status-panel";

export const dynamic = "force-dynamic";

export default async function CollegeUploadStatusPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") redirect("/dashboard");

  const [allSituationRows, profile] = await Promise.all([
    listOfficialExamSituationsForOwner(session.uid),
    getCollegeProfileByUserId(session.uid),
  ]);
  /** الجلسات التي بقيت بانتظار رفع/إكمال الموقف — المؤكَّد رفعُها تُعرَض في «متابعة المواقف» فقط */
  const rows = allSituationRows.filter((r) => !r.is_uploaded);
  const listItems = buildUploadStatusListItems(rows);
  const dashboardStats = computeUploadStatusDashboardStats(allSituationRows);
  const allUploadedPendingNone =
    allSituationRows.length > 0 && rows.length === 0;

  const collegeLabel =
    profile?.account_kind === "FOLLOWUP"
      ? (profile.holder_name ?? "—")
      : (profile?.formation_name ?? "—");

  return (
    <UploadStatusPanel
      listItems={listItems}
      collegeLabel={collegeLabel}
      allUploadedPendingNone={allUploadedPendingNone}
      dashboardStats={dashboardStats}
    />
  );
}
