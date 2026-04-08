import { listCollegeActivityLogForOwner } from "@/lib/college-activity-log";
import { CollegeActivityLogPanel } from "@/app/dashboard/college/reports/college-activity-log-panel";
import { requireDepartmentPortalWorkspace } from "../dept-workspace";

export const dynamic = "force-dynamic";

export default async function DepartmentReportsPage() {
  const { ws } = await requireDepartmentPortalWorkspace();
  const events = await listCollegeActivityLogForOwner(ws.dataOwnerUserId, 400);

  return <CollegeActivityLogPanel collegeLabel={ws.collegeLabel} initialEvents={events} />;
}
