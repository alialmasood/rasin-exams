import { Suspense } from "react";
import { listCollegeSubjectsByOwner } from "@/lib/college-subjects";
import { listCollegeStudySubjectsByOwner } from "@/lib/college-study-subjects";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { collegePortalDisplayLabel } from "@/lib/college-portal-scope";
import { StudySubjectsPanel } from "@/app/dashboard/college/study-subjects/study-subjects-panel";
import { requireDepartmentPortalWorkspace } from "../dept-workspace";

export const dynamic = "force-dynamic";

export default async function DepartmentStudySubjectsPage() {
  const { ws } = await requireDepartmentPortalWorkspace();
  const profile = await getCollegeProfileByUserId(ws.sessionUserId);
  const collegeLabel = profile ? collegePortalDisplayLabel(profile) : ws.collegeLabel;

  const [branches, rows] = await Promise.all([
    listCollegeSubjectsByOwner(ws.dataOwnerUserId, ws.collegeSubjectId),
    listCollegeStudySubjectsByOwner(ws.dataOwnerUserId, ws.collegeSubjectId),
  ]);

  return (
    <Suspense fallback={null}>
      <StudySubjectsPanel
        collegeLabel={collegeLabel}
        branches={branches}
        rows={rows}
        fixedCollegeSubjectId={ws.collegeSubjectId}
      />
    </Suspense>
  );
}
