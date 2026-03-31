export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { listCollegeSubjectsByOwner } from "@/lib/college-subjects";
import { listCollegeStudySubjectsByOwner } from "@/lib/college-study-subjects";
import { listCollegeExamRoomsByOwner } from "@/lib/college-rooms";
import { listCollegeExamSchedulesByOwner } from "@/lib/college-exam-schedules";
import { listCollegeHolidaysByOwner } from "@/lib/college-holidays";
import { getSession } from "@/lib/session";
import { ExamSchedulesPanel } from "./exam-schedules-panel";

export default async function CollegeExamSchedulesPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") redirect("/dashboard");

  const profile = await getCollegeProfileByUserId(session.uid);
  const collegeLabel =
    profile?.account_kind === "FOLLOWUP"
      ? (profile.holder_name ?? "حساب متابعة")
      : (profile?.formation_name ?? "حساب كلية");

  const [subjects, studySubjects, rooms, rows, holidays] = await Promise.all([
    listCollegeSubjectsByOwner(session.uid),
    listCollegeStudySubjectsByOwner(session.uid),
    listCollegeExamRoomsByOwner(session.uid),
    listCollegeExamSchedulesByOwner(session.uid),
    listCollegeHolidaysByOwner(session.uid),
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
      />
    </Suspense>
  );
}
