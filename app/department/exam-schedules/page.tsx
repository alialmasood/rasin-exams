import { Suspense } from "react";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { collegePortalDisplayLabel } from "@/lib/college-portal-scope";
import { listCollegeSubjectsByOwner } from "@/lib/college-subjects";
import { listCollegeStudySubjectsByOwner } from "@/lib/college-study-subjects";
import { listCollegeExamRoomsByOwner } from "@/lib/college-rooms";
import { listCollegeExamSchedulesByOwner } from "@/lib/college-exam-schedules";
import { listCollegeHolidaysByOwner } from "@/lib/college-holidays";
import { ExamSchedulesPanel } from "@/app/dashboard/college/exam-schedules/exam-schedules-panel";
import { requireDepartmentPortalWorkspace } from "../dept-workspace";

export const dynamic = "force-dynamic";

export default async function DepartmentExamSchedulesPage() {
  const { ws } = await requireDepartmentPortalWorkspace();
  const profile = await getCollegeProfileByUserId(ws.sessionUserId);
  const collegeLabel = profile ? collegePortalDisplayLabel(profile) : ws.collegeLabel;
  const rid = ws.collegeSubjectId;

  const [subjects, studySubjects, rooms, rows, holidays] = await Promise.all([
    listCollegeSubjectsByOwner(ws.dataOwnerUserId, rid),
    listCollegeStudySubjectsByOwner(ws.dataOwnerUserId, rid),
    listCollegeExamRoomsByOwner(ws.dataOwnerUserId, rid),
    listCollegeExamSchedulesByOwner(ws.dataOwnerUserId, ws.collegeSubjectId),
    listCollegeHolidaysByOwner(ws.dataOwnerUserId),
  ]);

  return (
    <Suspense fallback={null}>
      <ExamSchedulesPanel
        collegeLabel={collegeLabel}
        subjects={subjects}
        studySubjects={studySubjects}
        rooms={rooms}
        initialRows={rows}
        initialHolidays={holidays}
        fixedCollegeSubjectId={ws.collegeSubjectId}
      />
    </Suspense>
  );
}
