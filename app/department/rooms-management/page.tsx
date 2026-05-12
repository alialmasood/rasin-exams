import { Suspense } from "react";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { collegePortalDisplayLabel } from "@/lib/college-portal-scope";
import { listCollegeExamScheduleHintsByRoom } from "@/lib/college-exam-schedules";
import { listCollegeExamRoomsByOwner } from "@/lib/college-rooms";
import { listCollegeSubjectsByOwner } from "@/lib/college-subjects";
import { listCollegeStaffRegistryForOwner } from "@/lib/college-staff-registry";
import { listCollegeStudySubjectsByOwner } from "@/lib/college-study-subjects";
import type { StaffRegistryNamePicklist } from "@/lib/staff-registry-shared";
import { RoomsManagementPanel } from "@/app/dashboard/college/rooms-management/rooms-management-panel";
import { requireDepartmentPortalWorkspace } from "../dept-workspace";

export const dynamic = "force-dynamic";

export default async function DepartmentRoomsManagementPage() {
  const { ws } = await requireDepartmentPortalWorkspace();
  const profile = await getCollegeProfileByUserId(ws.sessionUserId);
  const collegeLabel = profile ? collegePortalDisplayLabel(profile) : ws.collegeLabel;
  const rid = ws.collegeSubjectId;

  const [branches, rows, studySubjects, scheduleHintsByRoom, staffRegistryRows] = await Promise.all([
    listCollegeSubjectsByOwner(ws.dataOwnerUserId, rid),
    listCollegeExamRoomsByOwner(ws.dataOwnerUserId, rid),
    listCollegeStudySubjectsByOwner(ws.dataOwnerUserId, rid),
    listCollegeExamScheduleHintsByRoom(ws.dataOwnerUserId, rid),
    listCollegeStaffRegistryForOwner(ws.dataOwnerUserId, ws.collegeSubjectId),
  ]);

  const staffRegistryPicklist: StaffRegistryNamePicklist | null = (() => {
    const names = new Set<string>();
    for (const r of staffRegistryRows) {
      const n = r.full_name.trim();
      if (n.length < 2) continue;
      names.add(n);
    }
    const sorted = [...names].sort((a, b) => a.localeCompare(b, "ar"));
    if (sorted.length === 0) return null;
    return { supervisors: sorted, invigilators: sorted };
  })();

  return (
    <Suspense fallback={null}>
      <RoomsManagementPanel
        branches={branches}
        rows={rows}
        studySubjects={studySubjects}
        scheduleHintsByRoom={scheduleHintsByRoom}
        collegeLabel={collegeLabel}
        fixedCollegeSubjectId={ws.collegeSubjectId}
        scopedBranchName={profile?.scoped_branch_name ?? null}
        staffRegistryPicklist={staffRegistryPicklist}
      />
    </Suspense>
  );
}
