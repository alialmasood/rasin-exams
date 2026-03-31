import { redirect } from "next/navigation";
import { isAdminRole, type UserRole } from "@/lib/authz";
import { listAllCollegeExamSchedulesForAdmin } from "@/lib/college-exam-schedules";
import { getSession } from "@/lib/session";
import { AdminExamsPanel } from "./admin-exams-panel";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "COLLEGE") {
    redirect("/dashboard/college/exam-schedules");
  }
  if (!isAdminRole(session.role as UserRole)) {
    redirect("/dashboard");
  }

  const initialRows = await listAllCollegeExamSchedulesForAdmin();
  return <AdminExamsPanel initialRows={initialRows} />;
}
