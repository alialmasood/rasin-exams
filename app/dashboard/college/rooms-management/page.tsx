import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { listCollegeExamScheduleHintsByRoom } from "@/lib/college-exam-schedules";
import { listCollegeExamRoomsByOwner } from "@/lib/college-rooms";
import { listCollegeStudySubjectsByOwner } from "@/lib/college-study-subjects";
import { getSession } from "@/lib/session";
import { RoomsManagementPanel } from "./rooms-management-panel";

export const dynamic = "force-dynamic";

export default async function CollegeRoomsManagementPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") redirect("/dashboard");

  const profile = await getCollegeProfileByUserId(session.uid);
  const collegeLabel =
    profile?.account_kind === "FOLLOWUP"
      ? (profile.holder_name ?? "حساب متابعة")
      : (profile?.formation_name ?? "حساب كلية");

  const [rows, studySubjects, scheduleHintsByRoom] = await Promise.all([
    listCollegeExamRoomsByOwner(session.uid),
    listCollegeStudySubjectsByOwner(session.uid),
    listCollegeExamScheduleHintsByRoom(session.uid),
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
