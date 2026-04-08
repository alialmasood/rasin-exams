import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { collegePortalDisplayLabel } from "@/lib/college-portal-scope";
import { listOfficialExamSituationsForOwner } from "@/lib/college-exam-situations";
import { buildUploadStatusListItems, computeUploadStatusDashboardStats } from "@/lib/upload-status-display";
import { UploadStatusPanel } from "@/app/dashboard/college/upload-status/upload-status-panel";
import { requireDepartmentPortalWorkspace } from "../dept-workspace";

export const dynamic = "force-dynamic";

export default async function DepartmentUploadStatusPage() {
  const { ws } = await requireDepartmentPortalWorkspace();
  const profile = await getCollegeProfileByUserId(ws.sessionUserId);
  const collegeLabel = profile ? collegePortalDisplayLabel(profile) : ws.collegeLabel;

  const allSituationRows = await listOfficialExamSituationsForOwner(
    ws.dataOwnerUserId,
    ws.collegeSubjectId
  );
  const pendingAll = allSituationRows.filter((r) => !r.is_uploaded);
  const listItems = buildUploadStatusListItems(pendingAll);
  const dashboardStats = computeUploadStatusDashboardStats(allSituationRows, new Date());
  const allUploadedPendingNone = allSituationRows.length > 0 && pendingAll.length === 0;

  return (
    <UploadStatusPanel
      listItems={listItems}
      collegeLabel={collegeLabel}
      allUploadedPendingNone={allUploadedPendingNone}
      dashboardStats={dashboardStats}
      hideDepartmentColumn
    />
  );
}
