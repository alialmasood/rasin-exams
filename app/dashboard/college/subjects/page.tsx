import { redirect } from "next/navigation";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { listCollegeSubjectUsageByOwner, listCollegeSubjectsByOwner } from "@/lib/college-subjects";
import { getSession } from "@/lib/session";
import { SubjectsPanel } from "./subjects-panel";

export const dynamic = "force-dynamic";

export default async function CollegeSubjectsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") {
    redirect("/dashboard");
  }

  const [rows, usageRows, profile] = await Promise.all([
    listCollegeSubjectsByOwner(session.uid),
    listCollegeSubjectUsageByOwner(session.uid),
    getCollegeProfileByUserId(session.uid),
  ]);
  const collegeLabel =
    profile?.account_kind === "FOLLOWUP"
      ? (profile.holder_name ?? "—")
      : (profile?.formation_name ?? "—");

  return <SubjectsPanel rows={rows} usageRows={usageRows} collegeLabel={collegeLabel} />;
}
