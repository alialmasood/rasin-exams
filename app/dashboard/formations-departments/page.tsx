import { redirect } from "next/navigation";
import { isAdminRole, type UserRole } from "@/lib/authz";
import { getAdminFormationControlRoomData } from "@/lib/admin-formations-departments";
import { listFormationActivityFeed } from "@/lib/formation-activity-feed";
import { getSession } from "@/lib/session";
import { FormationsDepartmentsPanel } from "./formations-departments-panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "التشكيلات والأقسام — مراقبة مركزية",
};

export default async function FormationsDepartmentsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "COLLEGE") {
    redirect("/dashboard/college/subjects");
  }
  if (!isAdminRole(session.role as UserRole)) {
    redirect("/dashboard");
  }

  const [data, activityFeed] = await Promise.all([getAdminFormationControlRoomData(), listFormationActivityFeed(160)]);
  return <FormationsDepartmentsPanel data={data} initialActivityFeed={activityFeed} />;
}
