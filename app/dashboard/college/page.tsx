import { redirect } from "next/navigation";
import { getShowCollegeExamSituationUploadCta } from "@/lib/app-settings";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { getCollegeDashboardSnapshot } from "@/lib/college-dashboard-stats";
import { getSession } from "@/lib/session";
import { CollegeDashboardOverview } from "./college-dashboard-overview";

export const dynamic = "force-dynamic";

export default async function CollegePortalPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") {
    redirect("/dashboard");
  }

  const [profile, snapshot, showExamSituationUploadCta] = await Promise.all([
    getCollegeProfileByUserId(session.uid),
    getCollegeDashboardSnapshot(session.uid),
    getShowCollegeExamSituationUploadCta(),
  ]);

  const collegeLabel =
    profile?.account_kind === "FOLLOWUP"
      ? (profile.holder_name ?? "—")
      : (profile?.formation_name ?? "—");

  return (
    <CollegeDashboardOverview
      profile={profile}
      snapshot={snapshot}
      collegeLabel={collegeLabel}
      showExamSituationUploadCta={showExamSituationUploadCta}
    />
  );
}
