import { getShowCollegeExamSituationUploadCta } from "@/lib/app-settings";
import { getCollegeDashboardSnapshot } from "@/lib/college-dashboard-stats";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { CollegeDashboardOverview } from "@/app/dashboard/college/college-dashboard-overview";
import { requireDepartmentPortalWorkspace } from "./dept-workspace";

export const dynamic = "force-dynamic";

export default async function DepartmentPortalPage() {
  const { ws } = await requireDepartmentPortalWorkspace();
  const [profile, snapshot, showExamSituationUploadCta] = await Promise.all([
    getCollegeProfileByUserId(ws.sessionUserId),
    getCollegeDashboardSnapshot(ws.dataOwnerUserId, ws.collegeSubjectId),
    getShowCollegeExamSituationUploadCta(),
  ]);

  return (
    <CollegeDashboardOverview
      profile={profile}
      snapshot={snapshot}
      collegeLabel={ws.collegeLabel}
      showExamSituationUploadCta={showExamSituationUploadCta}
    />
  );
}
