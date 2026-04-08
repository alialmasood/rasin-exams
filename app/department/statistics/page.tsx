import { getCollegeStatisticsPageData } from "@/lib/college-statistics-page";
import { CollegeStatisticsPanel } from "@/app/dashboard/college/statistics/college-statistics-panel";
import { requireDepartmentPortalWorkspace } from "../dept-workspace";

export const dynamic = "force-dynamic";

export default async function DepartmentStatisticsPage() {
  const { ws } = await requireDepartmentPortalWorkspace();
  const data = await getCollegeStatisticsPageData(ws.dataOwnerUserId, ws.collegeSubjectId);

  return <CollegeStatisticsPanel collegeLabel={ws.collegeLabel} data={data} />;
}
