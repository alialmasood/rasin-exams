import { redirect } from "next/navigation";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { listCollegeActivityLogForOwner } from "@/lib/college-activity-log";
import { getSession } from "@/lib/session";
import { CollegeActivityLogPanel } from "./college-activity-log-panel";

export const dynamic = "force-dynamic";

export default async function CollegeActivityLogPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") redirect("/dashboard");

  const profile = await getCollegeProfileByUserId(session.uid);
  const collegeLabel =
    profile?.account_kind === "FOLLOWUP"
      ? (profile.holder_name ?? "—")
      : (profile?.formation_name ?? "—");

  const events = await listCollegeActivityLogForOwner(session.uid, 400);

  return (
    <CollegeActivityLogPanel collegeLabel={collegeLabel} initialEvents={events} />
  );
}
