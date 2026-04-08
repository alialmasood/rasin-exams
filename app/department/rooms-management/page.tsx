import { Suspense } from "react";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { collegePortalDisplayLabel } from "@/lib/college-portal-scope";
import { listCollegeExamScheduleHintsByRoom } from "@/lib/college-exam-schedules";
import { listCollegeExamRoomsByOwner } from "@/lib/college-rooms";
import { listCollegeStudySubjectsByOwner } from "@/lib/college-study-subjects";
import { RoomsManagementPanel } from "@/app/dashboard/college/rooms-management/rooms-management-panel";
import { requireDepartmentPortalWorkspace } from "../dept-workspace";

export const dynamic = "force-dynamic";

export default async function DepartmentRoomsManagementPage() {
  const { ws } = await requireDepartmentPortalWorkspace();
  const profile = await getCollegeProfileByUserId(ws.sessionUserId);
  const collegeLabel = profile ? collegePortalDisplayLabel(profile) : ws.collegeLabel;
  const rid = ws.collegeSubjectId;

  const [rows, studySubjects, scheduleHintsByRoom] = await Promise.all([
    listCollegeExamRoomsByOwner(ws.dataOwnerUserId, rid),
    listCollegeStudySubjectsByOwner(ws.dataOwnerUserId, rid),
    listCollegeExamScheduleHintsByRoom(ws.dataOwnerUserId, rid),
  ]);

  return (
    <Suspense fallback={null}>
      <RoomsManagementPanel
        rows={rows}
        studySubjects={studySubjects}
        scheduleHintsByRoom={scheduleHintsByRoom}
        collegeLabel={collegeLabel}
      />
    </Suspense>
  );
}
