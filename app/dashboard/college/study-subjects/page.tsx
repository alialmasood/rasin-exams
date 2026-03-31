import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
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
  const profile = await getCollegeProfileByUserId(session.uid);
  const collegeLabel =
    profile?.account_kind === "FOLLOWUP"
      ? (profile.holder_name ?? "حساب متابعة")
      : (profile?.formation_name ?? "حساب كلية");

  const [branches, rows] = await Promise.all([
    listCollegeSubjectsByOwner(session.uid),
    listCollegeStudySubjectsByOwner(session.uid),
  ]);

  return (
    <Suspense fallback={null}>
      <StudySubjectsPanel collegeLabel={collegeLabel} branches={branches} rows={rows} />
    </Suspense>
  );
}
