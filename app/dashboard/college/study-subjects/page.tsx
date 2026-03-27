import { redirect } from "next/navigation";
import { listCollegeSubjectsByOwner } from "@/lib/college-subjects";
import { listCollegeStudySubjectsByOwner } from "@/lib/college-study-subjects";
import { getSession } from "@/lib/session";
import { StudySubjectsPanel } from "./study-subjects-panel";

export const dynamic = "force-dynamic";

export default async function CollegeStudySubjectsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") {
    redirect("/dashboard");
  }
  const [branches, rows] = await Promise.all([
    listCollegeSubjectsByOwner(session.uid),
    listCollegeStudySubjectsByOwner(session.uid),
  ]);

  return <StudySubjectsPanel branches={branches} rows={rows} />;
}
