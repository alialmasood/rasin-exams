import { redirect } from "next/navigation";
import { listCollegeSubjectsByOwner } from "@/lib/college-subjects";
import { getSession } from "@/lib/session";
import { SubjectsPanel } from "./subjects-panel";

export const dynamic = "force-dynamic";

export default async function CollegeSubjectsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") {
    redirect("/dashboard");
  }

  const rows = await listCollegeSubjectsByOwner(session.uid);
  return <SubjectsPanel rows={rows} />;
}
