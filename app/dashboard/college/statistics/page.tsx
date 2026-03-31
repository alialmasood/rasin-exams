import { redirect } from "next/navigation";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { getCollegeStatisticsPageData } from "@/lib/college-statistics-page";
import { getSession } from "@/lib/session";
import { CollegeStatisticsPanel } from "./college-statistics-panel";

export const dynamic = "force-dynamic";

export default async function CollegeStatisticsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") {
    redirect("/dashboard");
  }

  const [profile, data] = await Promise.all([
    getCollegeProfileByUserId(session.uid),
    getCollegeStatisticsPageData(session.uid),
  ]);

  const collegeLabel =
    profile?.account_kind === "FOLLOWUP"
      ? (profile.holder_name ?? "—")
      : (profile?.formation_name ?? "—");

  return <CollegeStatisticsPanel collegeLabel={collegeLabel} data={data} />;
}
