import { Suspense } from "react";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { collegePortalDisplayLabel } from "@/lib/college-portal-scope";
import { listCollegeSubjectsByOwner } from "@/lib/college-subjects";
import { listCollegeStaffRegistryForOwner } from "@/lib/college-staff-registry";
import { requireDepartmentPortalWorkspace } from "../dept-workspace";
import { StaffRegistryPanel } from "./staff-registry-panel";

export const dynamic = "force-dynamic";

export default async function DepartmentStaffRegistryPage() {
  const { ws } = await requireDepartmentPortalWorkspace();
  const profile = await getCollegeProfileByUserId(ws.sessionUserId);
  const collegeLabel = profile ? collegePortalDisplayLabel(profile) : ws.collegeLabel;
  const isCentralAccount = profile?.account_kind === "CENTRAL";

  const [rows, branches] = await Promise.all([
    listCollegeStaffRegistryForOwner(ws.dataOwnerUserId, ws.collegeSubjectId),
    listCollegeSubjectsByOwner(ws.dataOwnerUserId, isCentralAccount ? null : ws.collegeSubjectId),
  ]);

  return (
    <Suspense fallback={null}>
      <StaffRegistryPanel
        collegeLabel={collegeLabel}
        rows={rows}
        branches={branches}
        fixedCollegeSubjectId={ws.collegeSubjectId}
        isCentralAccount={isCentralAccount}
      />
    </Suspense>
  );
}
