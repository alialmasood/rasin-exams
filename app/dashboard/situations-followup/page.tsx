import { redirect } from "next/navigation";
import { listAllSituationFormSubmissionsForAdmin } from "@/lib/college-situation-form-submissions";
import { getSession } from "@/lib/session";
import { AdminSituationsFollowupView } from "./admin-situations-followup-view";

export const dynamic = "force-dynamic";

export default async function SituationsFollowupHubPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "COLLEGE") {
    redirect("/dashboard/college/status-followup");
  }

  const rows = await listAllSituationFormSubmissionsForAdmin();

  return <AdminSituationsFollowupView rows={rows} />;
}
